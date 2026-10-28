// 申告した依頼の型の雛形から外れた呼び出しの数え上げ。型を申告しなければ何も数えない。

import { numberCountOutsideCode } from "./number-count.ts"
import type { ReportDraft } from "./report-violation.ts"
import { type TemplateMiss, templateMisses } from "./request-template.ts"

/** 申告した型（`task.genre`）の雛形から外れた点。型を申告していない（`unspecified`・タスク無し）なら空。 */
export function templateMissesOf(
  report: Pick<ReportDraft, "task" | "conclusion" | "keyFigures" | "figure">,
): readonly TemplateMiss[] {
  if (report.task.kind !== "task" || report.task.genre === "unspecified") {
    return []
  }
  return templateMisses({
    genre: report.task.genre,
    conclusionNumbers: numberCountOutsideCode(report.conclusion),
    keyFigureCount: report.keyFigures.length,
    figureKind: report.figure.kind,
  })
}
