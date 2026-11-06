import { PNG } from "pngjs"

const DEFAULT_COLOR = [0x5b, 0x8d, 0xa6] as const

/** 一色で塗った架空の PNG（実物の画面は使わない）。 */
export function fictionalPng(
  width: number,
  height: number,
  color: readonly [number, number, number] = DEFAULT_COLOR,
): Buffer {
  const png = new PNG({ width, height, colorType: 2, inputHasAlpha: false })
  for (let index = 0; index < width * height; index++) {
    png.data.set([color[0], color[1], color[2], 255], index * 4)
  }
  return PNG.sync.write(png, { colorType: 2, inputHasAlpha: true })
}
