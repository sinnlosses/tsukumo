// Svg の部品の字の重なりと、図の外へのはみ出しを数える。
// 座標は svg の viewBox の座標（`getBBox()` の返す矩形）で比べる。字の中身は値に入れない。

import type { Page } from "playwright-core"

export type TextBox = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** 1つの Svg の図。`scale` は画面上の大きさ ÷ viewBox の大きさ。 */
export type SvgFigureText = {
  readonly viewBox: { readonly width: number; readonly height: number }
  readonly scale: number
  readonly boxes: readonly TextBox[]
  /** text 要素ごとの font-size（viewBox の座標の単位）。 */
  readonly fontSizes: readonly number[]
}

/** 字を持つ図ごとの、いちばん小さい字の画面上の px（font-size × 縮尺）。字を持たない図は入れない。 */
export function svgSmallestTextPx(figures: readonly SvgFigureText[]): readonly number[] {
  return figures.flatMap((figure) =>
    figure.fontSizes.length === 0 ? [] : [Math.min(...figure.fontSizes) * figure.scale],
  )
}

/** Svg の図が無ければ absent。`figures` は字を持たない図も含む。 */
export type SvgTextMetric =
  | { readonly kind: "absent" }
  | {
      readonly kind: "at"
      readonly figures: number
      readonly overlapping: number
      readonly outside: number
    }

/** 図ごとの字の矩形から、重なる組の数と viewBox の外へ出た字の数を全図で合算する。 */
export function svgTextMetricOf(figures: readonly SvgFigureText[]): SvgTextMetric {
  if (figures.length === 0) return { kind: "absent" }
  let overlapping = 0
  let outside = 0
  for (const figure of figures) {
    figure.boxes.forEach((box, index) => {
      if (isOutside(box, figure.viewBox)) outside += 1
      for (const other of figure.boxes.slice(index + 1)) {
        if (overlaps(box, other)) overlapping += 1
      }
    })
  }
  return { kind: "at", figures: figures.length, overlapping, outside }
}

/** 紙面の Svg の図ごとに、字の矩形と縮尺を集める。 */
export async function collectSvgFigureTexts(
  page: Page,
  selector: string,
): Promise<readonly SvgFigureText[]> {
  return page.evaluate((figureSelector) => {
    return Array.from(document.querySelectorAll<SVGSVGElement>(figureSelector)).flatMap((svg) => {
      const natural = svg.viewBox.baseVal
      const box = svg.getBoundingClientRect()
      if (natural.width <= 0 || natural.height <= 0 || box.width <= 0) return []
      return [
        {
          viewBox: { width: natural.width, height: natural.height },
          scale: Math.min(box.width / natural.width, box.height / natural.height),
          boxes: Array.from(svg.querySelectorAll("text")).map((text) => {
            const bbox = text.getBBox()
            return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }
          }),
          fontSizes: Array.from(svg.querySelectorAll("text"))
            .map((text) => parseFloat(getComputedStyle(text).fontSize))
            .filter((size) => size > 0),
        },
      ]
    })
  }, selector)
}

/** 接するだけの矩形は重なりに数えない。 */
function overlaps(a: TextBox, b: TextBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function isOutside(box: TextBox, viewBox: SvgFigureText["viewBox"]): boolean {
  return (
    box.x < 0 ||
    box.y < 0 ||
    box.x + box.width > viewBox.width ||
    box.y + box.height > viewBox.height
  )
}
