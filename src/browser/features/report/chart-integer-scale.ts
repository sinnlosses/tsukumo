// 値が整数だけのグラフの値の軸。Chart.js の既定は 0.5 刻みの小数の目盛りを足すので、目盛りを整数に限る。

import type { LeafComponent } from "../../../shared/report/report-block.ts"

export type IntegerValueScale = { readonly y: { readonly ticks: { readonly precision: 0 } } }

/** 全部の系列の値が整数なら値の軸（`y`）の目盛りを整数に限る設定を返し、小数があれば何も足さない。 */
export function integerScaleOf(
  block: Extract<LeafComponent, { readonly kind: "chart" }>,
): { readonly scales: IntegerValueScale } | Record<string, never> {
  return block.series.every(({ values }) => values.every(Number.isInteger))
    ? { scales: { y: { ticks: { precision: 0 } } } }
    : {}
}
