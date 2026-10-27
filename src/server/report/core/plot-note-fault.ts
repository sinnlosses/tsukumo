// 棒・折れ線・円で描いた `plot` のうち、題に数が無いものの数え上げ。値と系列名は描画が必ず出すので、題だけを見る。

import { plotFormOf } from "../../../shared/report/figure-decision.ts"
import type { ReportPlot } from "../../../shared/report/figure-grammar.ts"
import { plotChartOf } from "../../../shared/report/plot-chart.ts"
import { drawnSectionsOf } from "../../../shared/report/report-retrospective.ts"
import { leafBlocksOf } from "../../../shared/report/row-panel-block.ts"
import type { ReportDraft } from "./report-violation.ts"

const NUMERAL = /[0-9０-９]/u

/** `chart` で描かれた（表に落ちなかった）`plot` のうち、数を 1 つも含まない題を持つものの数。 */
export function plotNoteFaults(
  report: Pick<ReportDraft, "figure" | "sections" | "retrospective">,
): number {
  return drawnSectionsOf(report)
    .flatMap((section) => leafBlocksOf(section.blocks))
    .filter(
      (block): block is ReportPlot =>
        block.kind === "plot" &&
        !NUMERAL.test(block.question) &&
        plotChartOf(block, plotFormOf(block, block.form, "chart")) !== undefined,
    ).length
}
