import { crc32, deflateSync } from "node:zlib"

import { describe, expect, test } from "vitest"

import { decodePng } from "../../../../scripts/capture/lib/png-pixel.ts"

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, "latin1")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) {
    return a
  }
  return pb <= pc ? b : c
}

/** 行ごとのフィルタ（0〜4）で符号化した PNG を組む。 */
function encodePng(options: {
  readonly width: number
  readonly rows: readonly (readonly number[])[]
  readonly colorType: number
  readonly filters: readonly number[]
  readonly depth?: number
  readonly interlace?: number
}): Buffer {
  const channels = options.colorType === 6 ? 4 : 3
  const raw: number[] = []
  options.rows.forEach((row, y) => {
    const filter = options.filters[y] ?? 0
    raw.push(filter)
    row.forEach((value, x) => {
      const left = x >= channels ? (row[x - channels] ?? 0) : 0
      const up = y > 0 ? (options.rows[y - 1]?.[x] ?? 0) : 0
      const upLeft = y > 0 && x >= channels ? (options.rows[y - 1]?.[x - channels] ?? 0) : 0
      const predicted =
        [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upLeft)][filter] ?? 0
      raw.push((value - predicted) & 0xff)
    })
  })
  const header = Buffer.alloc(13)
  header.writeUInt32BE(options.width, 0)
  header.writeUInt32BE(options.rows.length, 4)
  header[8] = options.depth ?? 8
  header[9] = options.colorType
  header[12] = options.interlace ?? 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const RGB_ROWS = [
  [10, 20, 30, 40, 50, 60, 70, 80, 90],
  [15, 25, 35, 45, 55, 65, 75, 85, 95],
  [200, 100, 0, 1, 2, 3, 250, 251, 252],
]

describe("decodePng", () => {
  test("フィルタ 0・1・2・4 を混ぜた RGB を元の画素に戻す（alpha は 255）", () => {
    const png = decodePng(encodePng({ width: 3, rows: RGB_ROWS, colorType: 2, filters: [1, 2, 4] }))
    expect(png.width).toBe(3)
    expect(png.height).toBe(3)
    const expected = RGB_ROWS.flatMap((row) =>
      [0, 1, 2].flatMap((pixel) => [...row.slice(pixel * 3, pixel * 3 + 3), 255]),
    )
    expect([...png.pixels]).toStrictEqual(expected)
  })

  test("フィルタ 0・3 の RGBA を元の画素に戻す", () => {
    const rows = [
      [1, 2, 3, 4, 5, 6, 7, 8],
      [9, 10, 11, 12, 200, 201, 202, 203],
    ]
    const png = decodePng(encodePng({ width: 2, rows, colorType: 6, filters: [0, 3] }))
    expect([...png.pixels]).toStrictEqual(rows.flat())
  })

  test("16bit・インターレース・パレットは throw する", () => {
    const rows = [[0, 0, 0]]
    expect(() =>
      decodePng(encodePng({ width: 1, rows, colorType: 2, filters: [0], depth: 16 })),
    ).toThrow("読めない PNG: depth 16")
    expect(() =>
      decodePng(encodePng({ width: 1, rows, colorType: 2, filters: [0], interlace: 1 })),
    ).toThrow("読めない PNG: depth 8 interlace 1")
    expect(() => decodePng(encodePng({ width: 1, rows, colorType: 3, filters: [0] }))).toThrow(
      "読めない PNG: color type 3",
    )
  })

  test("PNG でないものは throw する", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow("PNG ではない")
  })
})
