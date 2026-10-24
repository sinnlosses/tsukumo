// 0〜255 の sRGB の色を OKLCH（明度・彩度・色相）にする。

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

function linear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
