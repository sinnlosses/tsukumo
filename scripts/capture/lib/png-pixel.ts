// 撮った PNG の画素を読む。色を数えるためだけの小さな読み取りで、形式の解読は pngjs に任せる。

import { PNG } from "pngjs"

export type PngPixels = {
  readonly width: number
  readonly height: number
  /** RGBA を画素ごとに 4 バイトずつ、左上から行の順に並べたもの。 */
  readonly pixels: Uint8Array
}

export function decodePng(buffer: Uint8Array): PngPixels {
  const png = PNG.sync.read(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength))
  return { width: png.width, height: png.height, pixels: png.data }
}
