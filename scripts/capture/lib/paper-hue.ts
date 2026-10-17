// 画素の色を OKLCH にして、色相の族（30° 刻み）に数える。紙面の物差しの「色相の族」。

import type { PngPixels } from "./png-pixel.ts"

/** これ未満の彩度（OKLCH の C）の画素は無彩色として数えない。 */
const CHROMA_FLOOR = 0.06

/** 族の幅（度）。 */
const FAMILY_WIDTH_DEGREES = 30

/** 文字の縁の補間で出る数画素の色を族に数えないための下限。 */
const MIN_FAMILY_PIXELS = 30

type Oklch = { readonly lightness: number; readonly chroma: number; readonly hue: number }

/** 0〜255 の sRGB を OKLCH にする。hue は 0 以上 360 未満の度。 */
export function srgbToOklch(red: number, green: number, blue: number): Oklch {
  const r = linear(red)
  const g = linear(green)
  const b = linear(blue)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI
  return { lightness, chroma: Math.hypot(a, bAxis), hue: hue < 0 ? hue + 360 : hue }
}

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

function linear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
