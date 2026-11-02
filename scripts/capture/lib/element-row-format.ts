// `--measure` が当たった要素の測定値から出す行の組み立て。

export type ElementMeasure =
  | {
      readonly kind: "rendered"
      readonly top: number
      readonly bottom: number
      readonly left: number
      readonly width: number
      readonly height: number
      readonly scrollHeight: number
      readonly clientHeight: number
    }
  | { readonly kind: "hidden" }

export function formatElementLines(measures: readonly ElementMeasure[]): readonly string[] {
  const [only, ...rest] = measures
  if (only === undefined) {
    return ["無し"]
  }
  if (rest.length === 0) {
    return [only.kind === "hidden" ? "1件（描画されていない）" : formatRect(only)]
  }
  return [
    `${String(measures.length)}件`,
    ...measures.map(
      (measure, index) =>
        `  ${String(index + 1)}件目: ${measure.kind === "hidden" ? "描画されていない" : formatRect(measure)}`,
    ),
  ]
}

function formatRect(measure: Extract<ElementMeasure, { kind: "rendered" }>): string {
  return `top ${round(measure.top)} / bottom ${round(measure.bottom)} / left ${round(measure.left)} / 幅 ${round(measure.width)} / 高さ ${round(measure.height)} / scrollHeight ${String(measure.scrollHeight)} / clientHeight ${String(measure.clientHeight)}`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
