// 色のトークンの実効値を、外部のライブラリ（Chart.js・mermaid）が受け取れる形に解く。

/**
 * カスタムプロパティの実効値。
 * `getComputedStyle` からカスタムプロパティを直接読むと `color-mix(...)` の式のまま返る（式が色になるのは色のプロパティに載ったときだけ）ので、いったん要素の `color` に載せてから読み戻す。
 * Chart.js は受け取った文字列を canvas の色として使うので、式のままでは渡せない。
 */
export function resolveColor(element: HTMLElement, property: string): string {
  return resolveColorExpression(element, `var(${property})`)
}

/** トークンを `percent`% だけ透かした色の実効値。 */
export function resolveColorMix(element: HTMLElement, property: string, percent: number): string {
  return resolveColorExpression(
    element,
    `color-mix(in srgb, var(${property}) ${String(percent)}%, transparent)`,
  )
}

type Rgba = { readonly r: number; readonly g: number; readonly b: number; readonly a: number }

/**
 * カスタムプロパティの実効値を `#rrggbb` にする。mermaid の `themeVariables` は hex しか受け取らない。
 * 色の表記（`rgb()` / `color(srgb ...)`）は処理系で違うので、文字列は割らず canvas に塗って読む。
 */
export function resolveHex(element: HTMLElement, property: string): string {
  const front = readPixel(resolveColor(element, property))
  return toHex((get) => get(front))
}

/** 透ける色（`ink-soft` など）を `backdrop` のトークンの上に重ねた不透明な `#rrggbb` にする。 */
export function resolveHexOver(element: HTMLElement, property: string, backdrop: string): string {
  const front = readPixel(resolveColor(element, property))
  const back = readPixel(resolveColor(element, backdrop))
  return toHex((get) => get(front) * front.a + get(back) * (1 - front.a))
}

function resolveColorExpression(element: HTMLElement, expression: string): string {
  const before = element.style.color
  element.style.color = expression
  const resolved = getComputedStyle(element).color
  element.style.color = before
  return resolved
}

function toHex(mix: (get: (color: Rgba) => number) => number): string {
  const channel = (get: (color: Rgba) => number): string =>
    Math.round(mix(get)).toString(16).padStart(2, "0")
  return `#${channel((color) => color.r)}${channel((color) => color.g)}${channel((color) => color.b)}`
}

function readPixel(color: string): Rgba {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (context === null) {
    throw new Error("canvas が使えない")
  }
  context.fillStyle = "#000"
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data
  return { r, g, b, a: a / 255 }
}
