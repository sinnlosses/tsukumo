// 決定表が bar・line・pie を返した `plot` を、`chart` の塊へ写す。写せない申告は表に落とすので `undefined`。

import type { PlotFormResolution } from "./figure-decision.ts"
import type { ReportPlot } from "./figure-grammar.ts"
import type { ReportBlock } from "./report-block.ts"

type ReportChart = Extract<ReportBlock, { readonly kind: "chart" }>

/** 横棒に切り替える行の数。項目名を縦に並べたほうが読める。 */
const HORIZONTAL_BAR_ROWS = 4

/**
 * 名義・順序・時間の列を `labels`、量の列を `series`（列の名前が系列名）にする。
 * 前後の 2 つの量は `slope`、始まりと終わりの 2 つの量の `range` は `span` にする。
 */
export function plotChartOf(
  plot: ReportPlot,
  resolution: PlotFormResolution,
): ReportChart | undefined {
  const { form } = resolution
  if (form !== "bar" && form !== "line" && form !== "pie") return undefined
  const channels = resolution.decision.encoding.map((entry) => entry.channel)
  const labelColumns = plot.data.filter((_, index) => channels[index] !== "y")
  const quantityColumns = plot.data.filter((_, index) => channels[index] === "y")
  const [labelColumn] = labelColumns
  if (labelColumn === undefined || labelColumns.length !== 1 || quantityColumns.length === 0) {
    return undefined
  }
  const quantities = quantityColumns.map((column) => ({
    name: column.name,
    values: column.values.filter((value): value is number => typeof value === "number"),
  }))
  const base = {
    kind: "chart",
    title: plot.question,
    labels: labelColumn.values.map(String),
    series: quantities,
    horizontal: false,
    emphasis: [],
    fold: plot.fold,
    aside: plot.aside,
  } as const satisfies Omit<ReportChart, "chartKind">
  if (form === "pie") return { ...base, chartKind: "pie" }
  if (form === "line") {
    return plot.relation === "change" && labelColumn.type !== "T" && quantities.length === 2
      ? { ...base, chartKind: "slope" }
      : { ...base, chartKind: "line" }
  }
  if (plot.relation === "range" && quantities.length === 2) return { ...base, chartKind: "span" }
  return { ...base, chartKind: "bar", horizontal: base.labels.length >= HORIZONTAL_BAR_ROWS }
}
