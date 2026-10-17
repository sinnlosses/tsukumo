// 撮った PNG の画素を読む。色を数えるためだけの小さな読み取りで、
// Chromium の screenshot が出す形（8bit・非インターレースの RGB / RGBA）だけを扱い、それ以外は throw する。

import { inflateSync } from "node:zlib"

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

const COLOR_TYPE_RGB = 2
const COLOR_TYPE_RGBA = 6

export type PngPixels = {
  readonly width: number
  readonly height: number
  /** RGBA を画素ごとに 4 バイトずつ、左上から行の順に並べたもの。 */
  readonly pixels: Uint8Array
}

export function decodePng(buffer: Uint8Array): PngPixels {
  if (!SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    throw new Error("PNG ではない")
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const header = { width: 0, height: 0, depth: 0, colorType: 0, interlace: 0 }
  const compressed: Uint8Array[] = []
  for (let offset = SIGNATURE.length; offset + 8 <= buffer.length;) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...buffer.subarray(offset + 4, offset + 8))
    const body = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      header.width = view.getUint32(offset + 8)
      header.height = view.getUint32(offset + 12)
      header.depth = body[8] ?? 0
      header.colorType = body[9] ?? 0
      header.interlace = body[12] ?? 0
    } else if (type === "IDAT") {
      compressed.push(body)
    } else if (type === "IEND") {
      break
    }
    offset += 12 + length
  }

  const channels = channelsOf(header)
  const rows = unfilter(inflateSync(Buffer.concat(compressed)), header, channels)
  return { width: header.width, height: header.height, pixels: toRgba(rows, header, channels) }
}

type Header = { readonly width: number; readonly height: number }

function channelsOf(header: Header & { depth: number; colorType: number; interlace: number }) {
  if (header.depth !== 8 || header.interlace !== 0) {
    throw new Error(
      `読めない PNG: depth ${String(header.depth)} interlace ${String(header.interlace)}`,
    )
  }
  if (header.colorType === COLOR_TYPE_RGB) {
    return 3
  }
  if (header.colorType === COLOR_TYPE_RGBA) {
    return 4
  }
  throw new Error(`読めない PNG: color type ${String(header.colorType)}`)
}

/** フィルタ 0〜4 を戻し、行ごとの生の画素（フィルタの 1 バイトを除いたもの）を縦に並べる。 */
function unfilter(raw: Uint8Array, header: Header, channels: number): Uint8Array {
  const stride = header.width * channels
  if (raw.length !== (stride + 1) * header.height) {
    throw new Error("PNG の画素の長さが合わない")
  }
  const out = new Uint8Array(stride * header.height)
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0
    const source = y * (stride + 1) + 1
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? (out[row + x - channels] ?? 0) : 0
      const up = y > 0 ? (out[row - stride + x] ?? 0) : 0
      const upLeft = y > 0 && x >= channels ? (out[row - stride + x - channels] ?? 0) : 0
      out[row + x] = ((raw[source + x] ?? 0) + predictor(filter, left, up, upLeft)) & 0xff
    }
  }
  return out
}

function predictor(filter: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return 0
    case 1:
      return left
    case 2:
      return up
    case 3:
      return Math.floor((left + up) / 2)
    case 4:
      return paeth(left, up, upLeft)
    default:
      throw new Error(`知らない PNG のフィルタ: ${String(filter)}`)
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const distanceLeft = Math.abs(estimate - left)
  const distanceUp = Math.abs(estimate - up)
  const distanceUpLeft = Math.abs(estimate - upLeft)
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) {
    return left
  }
  return distanceUp <= distanceUpLeft ? up : upLeft
}

function toRgba(rows: Uint8Array, header: Header, channels: number): Uint8Array {
  if (channels === 4) {
    return rows
  }
  const count = header.width * header.height
  const pixels = new Uint8Array(count * 4)
  for (let index = 0; index < count; index++) {
    pixels[index * 4] = rows[index * 3] ?? 0
    pixels[index * 4 + 1] = rows[index * 3 + 1] ?? 0
    pixels[index * 4 + 2] = rows[index * 3 + 2] ?? 0
    pixels[index * 4 + 3] = 255
  }
  return pixels
}
