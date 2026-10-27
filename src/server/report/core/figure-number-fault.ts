// `plot` の `Q` 列の値と、同じレポートの本文の数のずれの検出。位置だけを持ち、本文の字と列の名前は持たない。

import type { ReportPlot } from "../../../shared/report/figure-grammar.ts"
import {
  type BodyNumber,
  type FigureNumberSlip,
  figureNumberSlips,
  numbersIn,
} from "../../../shared/report/figure-number.ts"
import { drawnSectionsOf } from "../../../shared/report/report-retrospective.ts"
import type { ReportDraft } from "./report-violation.ts"

/** `plot` の何個目の何列目と、本文の何番目の数がずれたか。 */
export type FigureNumberFault = FigureNumberSlip

type FigureNumberSource = Pick<
  ReportDraft,
  "conclusion" | "keyFigures" | "figure" | "sections" | "retrospective"
>

export function figureNumberFaults(report: FigureNumberSource): readonly FigureNumberFault[] {
  const plots = drawnSectionsOf(report)
    .flatMap((section) => section.blocks)
    .flatMap((block): readonly ReportPlot[] => (block.kind === "plot" ? [block] : []))
  return plots.length === 0 ? [] : figureNumberSlips(plots, bodyNumbersOf(report))
}

/** ずれた数の位置（何個目の `plot` の何列目と、本文の何番目の数か）の並び。 */
export function figureNumberFaultPositions(faults: readonly FigureNumberFault[]): string {
  return faults
    .map(
      (fault) =>
        `${String(fault.plot)}個目の plot の ${String(fault.column)} 列目と本文の ${String(fault.bodyNumber)} 番目の数`,
    )
    .join("、")
}

/** 結論 → `keyFigures` → 節の `text` の塊の順に読んだ本文の数。 */
function bodyNumbersOf(report: FigureNumberSource): readonly BodyNumber[] {
  return [
    ...numbersIn(report.conclusion),
    ...report.keyFigures.flatMap((item) =>
      [item.before, item.value, item.total].flatMap(numbersIn),
    ),
    ...report.sections
      .flatMap((section) => section.blocks)
      .flatMap((block) => (block.kind === "text" ? numbersIn(block.text) : [])),
  ]
}
