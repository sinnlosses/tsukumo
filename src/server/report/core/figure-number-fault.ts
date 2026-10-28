// `plot` の `Q` 列の値と、同じレポートの本文の数のずれの検出。位置だけを持ち、本文の字と列の名前は持たない。

import {
  drawnLeaves,
  plotsOfLeaves,
  type ReportOutline,
  sectionLeaves,
} from "../../../shared/report/report-outline.ts"
import {
  type BodyNumber,
  type FigureNumberSlip,
  figureNumberSlips,
  numbersIn,
} from "./figure-number.ts"
import type { ReportDraft } from "./report-violation.ts"

/** `plot` の何個目の何列目と、本文の何番目の数がずれたか。 */
export type FigureNumberFault = FigureNumberSlip

type FigureNumberSource = Pick<ReportDraft, "conclusion" | "keyFigures">

export function figureNumberFaults(
  report: FigureNumberSource,
  outline: ReportOutline,
): readonly FigureNumberFault[] {
  const plots = plotsOfLeaves(drawnLeaves(outline))
  return plots.length === 0 ? [] : figureNumberSlips(plots, bodyNumbersOf(report, outline))
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

/** 結論 → `keyFigures` → 節の `Paragraph` の順に読んだ本文の数。 */
function bodyNumbersOf(report: FigureNumberSource, outline: ReportOutline): readonly BodyNumber[] {
  return [
    ...numbersIn(report.conclusion),
    ...report.keyFigures.flatMap((item) =>
      [item.before, item.value, item.total].flatMap(numbersIn),
    ),
    ...sectionLeaves(outline).flatMap((leaf) =>
      leaf.component === "Paragraph" ? numbersIn(leaf.text) : [],
    ),
  ]
}
