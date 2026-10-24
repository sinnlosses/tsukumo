// 画像のファイルの頭から、画素の幅と高さを読む。中身は解かず、形式ごとの決まった位置だけを見る。

import type { PromptImageMediaType } from "../../../shared/session-driver/prompt-image.ts"

/** 読めた寸法か、形が崩れていて読めなかったか。 */
export type ImageSize =
  | { readonly kind: "measured"; readonly width: number; readonly height: number }
  | { readonly kind: "unmeasured" }

const UNMEASURED = { kind: "unmeasured" } as const satisfies ImageSize

/** JPEG の、寸法を持つ SOF の印（`C4`・`C8`・`CC` は SOF ではない）。 */
const JPEG_FRAME_MARKERS: ReadonlySet<number> = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

/** `content` は先頭の印で `mediaType` の形式と確かめ済みの中身。 */
export function imageSizeOf(mediaType: PromptImageMediaType, content: Uint8Array): ImageSize {
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength)
  switch (mediaType) {
    case "image/png":
      return pngSize(view)
    case "image/gif":
      return gifSize(view)
    case "image/jpeg":
      return jpegSize(view)
    case "image/webp":
      return webpSize(view)
  }
}

function pngSize(view: DataView): ImageSize {
  if (view.byteLength < 24 || ascii(view, 12, 4) !== "IHDR") {
    return UNMEASURED
  }
  return measured(view.getUint32(16), view.getUint32(20))
}

function gifSize(view: DataView): ImageSize {
  if (view.byteLength < 10) {
    return UNMEASURED
  }
  return measured(view.getUint16(6, true), view.getUint16(8, true))
}

function jpegSize(view: DataView): ImageSize {
  let offset = 2
  while (offset + 9 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      return UNMEASURED
    }
    const marker = view.getUint8(offset + 1)
    if (JPEG_FRAME_MARKERS.has(marker)) {
      return measured(view.getUint16(offset + 7), view.getUint16(offset + 5))
    }
    offset += 2 + view.getUint16(offset + 2)
  }
  return UNMEASURED
}

function webpSize(view: DataView): ImageSize {
  if (view.byteLength < 30) {
    return UNMEASURED
  }
  switch (ascii(view, 12, 4)) {
    case "VP8 ":
      return measured(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff)
    case "VP8L": {
      const bits = view.getUint32(21, true)
      return measured((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
    }
    case "VP8X":
      return measured(uint24(view, 24) + 1, uint24(view, 27) + 1)
    default:
      return UNMEASURED
  }
}

function measured(width: number, height: number): ImageSize {
  return width > 0 && height > 0 ? { kind: "measured", width, height } : UNMEASURED
}

function ascii(view: DataView, offset: number, length: number): string {
  return String.fromCharCode(...Array.from({ length }, (_, index) => view.getUint8(offset + index)))
}

function uint24(view: DataView, offset: number): number {
  return (
    view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
  )
}
