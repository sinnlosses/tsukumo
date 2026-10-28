// 棒・折れ線・円で描いた `plot` のうち、題に数が無いものの数え上げ。値と系列名は描画が必ず出すので、題だけを見る。

import { plotFormOf } from "../../../shared/report/figure-decision.ts"
import { plotChartOf } from "../../../shared/report/plot-chart.ts"
import {
  drawnLeaves,
  plotsOfLeaves,
  type ReportOutline,
} from "../../../shared/report/report-outline.ts"

const NUMERAL = /[0-9０-９]/u

/** `chart` で描かれた（表に落ちなかった）`plot` のうち、数を 1 つも含まない題を持つものの数。 */
export function plotNoteFaults(outline: ReportOutline): number {
  return plotsOfLeaves(drawnLeaves(outline)).filter(
    (plot) =>
      !NUMERAL.test(plot.question) &&
      plotChartOf(plot, plotFormOf(plot, plot.form, "chart")) !== undefined,
  ).length
}
