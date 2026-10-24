// 画素の色を OKLCH にして、色相の族（30° 刻み）に数える。紙面の物差しの「色相の族」。

import { srgbToOklch } from "./oklch.ts"
import type { PngPixels } from "./png-pixel.ts"

/** これ未満の彩度（OKLCH の C）の画素は無彩色として数えない。 */
const CHROMA_FLOOR = 0.06

/** 族の幅（度）。 */
const FAMILY_WIDTH_DEGREES = 30

/** 文字の縁の補間で出る数画素の色を族に数えないための下限。 */
const MIN_FAMILY_PIXELS = 30

/** 彩度が閾値以上の画素を色相の族に数え、画素が少なすぎる族を外す。キーは族の始まりの度。度の昇順。 */
export function hueFamilies(png: PngPixels): ReadonlyMap<number, number> {
  const counts = new Map<number, number>()
  const seen = new Map<number, number>()
  for (let index = 0; index < png.pixels.length; index += 4) {
    const key =
      ((png.pixels[index] ?? 0) << 16) |
      ((png.pixels[index + 1] ?? 0) << 8) |
      (png.pixels[index + 2] ?? 0)
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  for (const [key, pixels] of seen) {
    const color = srgbToOklch((key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff)
    if (color.chroma < CHROMA_FLOOR) {
      continue
    }
    const family = Math.floor(color.hue / FAMILY_WIDTH_DEGREES) * FAMILY_WIDTH_DEGREES
    counts.set(family, (counts.get(family) ?? 0) + pixels)
  }
  return new Map(
    [...counts].filter(([, pixels]) => pixels >= MIN_FAMILY_PIXELS).toSorted(([a], [b]) => a - b),
  )
}
