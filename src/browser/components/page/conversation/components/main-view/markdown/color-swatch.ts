// レポートの inline code に書かれた色（`#bca0ec` のようなカラーコードと、`ink-quiet` /
// `--state-memo` のような色のトークン名）を、その色を地にして見せるための判定
// （docs/display.md 4.2「各表示物」）。

/** 地の色と、その上に載せる文字の側（明るい地には暗い字、暗い地には明るい字）。 */
export type ColorSwatch = {
  readonly background: string
  readonly ink: "dark" | "light"
}

/**
 * 実効の色（sRGB の 0〜1 と不透明度）。トークンは `color-mix(...)` の式で持っているので、
 * 字の明暗を決めるには一度ブラウザに解決させた値が要る（{@link readColorToken}）。
 */
export type ResolvedColor = {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly alpha: number
}

/** トークン名から実効の色を引く口。無いトークン・色でないトークンは `undefined`。 */
export type ColorTokenReader = (name: string) => ResolvedColor | undefined

/**
 * inline code の文字列が色を指していれば、見せ方を返す。文字列全体が1つの色のときだけ
 * （文中に色が混ざっているものは地にしない）。トークンの地は `var(--…)` のまま渡すので、
 * キャラクターパックで `accent` が変わっても地は追いかける。
 */
export function colorSwatch(text: string, readToken: ColorTokenReader): ColorSwatch | undefined {
  const hex = parseHexColor(text)
  if (hex !== undefined) {
    return { background: text, ink: inkOver(hex, readToken("surface")) }
  }
  const name = TOKEN_PATTERN.exec(text)?.[1]
  if (name === undefined) {
    return undefined
  }
  const resolved = readToken(name)
  return resolved === undefined
    ? undefined
    : { background: `var(--${name})`, ink: inkOver(resolved, readToken("surface")) }
}

/**
 * ページのトークンを実効の色に解決する（ブラウザの中でだけ動く）。`getComputedStyle` で
 * カスタムプロパティを直接読むと式のまま返るので、いったん要素の `color` に載せてから読み戻す。
 * 色でないトークン（`font-body` など）は `color` に載せると無効になって親の色を継ぐので、
 * 親に置いた見張りの色がそのまま返ってきたら色ではないと見なす。
 */
export function readColorToken(name: string): ResolvedColor | undefined {
  const root = document.documentElement
  if (getComputedStyle(root).getPropertyValue(`--${name}`).trim() === "") {
    return undefined
  }
  const sentinel = document.createElement("span")
  sentinel.style.color = SENTINEL_COLOR
  const probe = document.createElement("span")
  probe.style.color = `var(--${name})`
  sentinel.append(probe)
  root.append(sentinel)
  const sentinelColor = getComputedStyle(sentinel).color
  const probeColor = getComputedStyle(probe).color
  sentinel.remove()
  return probeColor === sentinelColor ? undefined : parseComputedColor(probeColor)
}

/** `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`。 */
const HEX_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** `ink-quiet` / `--ink-quiet` / `var(--ink-quiet)`。 */
const TOKEN_PATTERN = /^(?:var\()?(?:--)?([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\)?$/

/** トークンが色かどうかを見分けるための、トークンには使われない色。 */
const SENTINEL_COLOR = "rgb(1, 2, 3)"

/** 明るさ（相対輝度）がこれを超える地には暗い字を載せる（暗い字と明るい字の比が釣り合う点）。 */
const LIGHT_BACKGROUND_LUMINANCE = 0.179

function parseHexColor(text: string): ResolvedColor | undefined {
  if (!HEX_PATTERN.test(text)) {
    return undefined
  }
  const digits = text.slice(1)
  const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join("") : digits
  const channel = (index: number): number => Number.parseInt(full.slice(index, index + 2), 16) / 255
  return { r: channel(0), g: channel(2), b: channel(4), alpha: full.length === 8 ? channel(6) : 1 }
}

/** ブラウザが返す `rgb(...)` / `rgba(...)` / `color(srgb ...)`。それ以外の形は読めない。 */
function parseComputedColor(css: string): ResolvedColor | undefined {
  const rgb = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(css)
  if (rgb !== null) {
    const [, r, g, b, alpha] = rgb
    return {
      r: Number(r) / 255,
      g: Number(g) / 255,
      b: Number(b) / 255,
      alpha: alpha === undefined ? 1 : Number(alpha),
    }
  }
  const srgb = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(css)
  if (srgb !== null) {
    const [, r, g, b, alpha] = srgb
    return {
      r: Number(r),
      g: Number(g),
      b: Number(b),
      alpha: alpha === undefined ? 1 : Number(alpha),
    }
  }
  return undefined
}

/**
 * 地に載せる字の明暗。透ける色は `surface`（本文の地）に重ねた姿で測る。`surface` が
 * 読めないときは黒に重ねたものとして測る。
 */
function inkOver(color: ResolvedColor, surface: ResolvedColor | undefined): "dark" | "light" {
  const under = surface ?? { r: 0, g: 0, b: 0, alpha: 1 }
  const mix = (top: number, bottom: number): number =>
    top * color.alpha + bottom * (1 - color.alpha)
  const luminance = relativeLuminance(
    mix(color.r, under.r),
    mix(color.g, under.g),
    mix(color.b, under.b),
  )
  return luminance > LIGHT_BACKGROUND_LUMINANCE ? "dark" : "light"
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linear = (value: number): number =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}
