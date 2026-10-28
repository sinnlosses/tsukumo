// `plot` を描く形（図の値か、表に落とすか）を1回だけ決める。

import { plotFormOf } from "./figure-decision.ts"
import type { ReportPlot } from "./figure-grammar.ts"
import { plotChartOf } from "./plot-chart.ts"
import { plotGaugeOf } from "./plot-gauge.ts"
import { plotHistogramOf } from "./plot-histogram.ts"
import { plotScatterOf } from "./plot-scatter.ts"

export type PlotDrawing =
  | { readonly kind: "table" }
  | { readonly kind: "chart"; readonly chart: NonNullable<ReturnType<typeof plotChartOf>> }
  | { readonly kind: "gauge"; readonly gauge: NonNullable<ReturnType<typeof plotGaugeOf>> }
  | { readonly kind: "scatter"; readonly scatter: NonNullable<ReturnType<typeof plotScatterOf>> }
  | {
      readonly kind: "histogram"
      readonly histogram: NonNullable<ReturnType<typeof plotHistogramOf>>
    }

const TABLE = { kind: "table" } as const satisfies PlotDrawing

/**
 * 決定表の形のうち描き方のあるもの（棒・折れ線・円・数直線・bullet・散布・ヒストグラム）は、その描き方の値にする。
 * 描き方の無い形と、値を写せない申告は表に落とす。
 * 描く経路は利用者の図の既定を持たないので、図派として決める。
 */
export function plotDrawingOf(block: ReportPlot): PlotDrawing {
  const resolution = plotFormOf(block, block.form, "chart")
  switch (resolution.form) {
    case "bar":
    case "line":
    case "pie": {
      const chart = plotChartOf(block, resolution)
      return chart === undefined ? TABLE : { kind: "chart", chart }
    }
    case "numberLine":
    case "bullet": {
      const gauge = plotGaugeOf(block, resolution)
      return gauge === undefined ? TABLE : { kind: "gauge", gauge }
    }
    case "scatter": {
      const scatter = plotScatterOf(block, resolution)
      return scatter === undefined ? TABLE : { kind: "scatter", scatter }
    }
    case "histogram": {
      const histogram = plotHistogramOf(block, resolution)
      return histogram === undefined ? TABLE : { kind: "histogram", histogram }
    }
    default:
      return TABLE
  }
}
