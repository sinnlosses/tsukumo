// 新しい器の紙の形を、レポートの欄から決める。
// 当てる順と条件は ADR 0056「論点 7」の紙の形の表で、上から当てて最初に当たった形にする。

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ChangedFilesView } from "../../../../shared/report/changed-file-section.ts"
import type { ReportChecksView } from "../../../../shared/report/report-check-view.ts"
import type { ReportProgress } from "../../../../shared/report/report-progress-field.ts"

export type PaperForm = "stopped" | "decide" | "answer" | "deliver"

type PaperFormInput = {
  readonly progress: Pick<ReportProgress, "verdict" | "next">
  readonly components: readonly A2uiReportComponent[]
  readonly changedFiles: ChangedFilesView
  readonly checks: ReportChecksView
  /** 本文の節に写った根の子の数。 */
  readonly sectionCount: number
}

export function paperFormOf(input: PaperFormInput): PaperForm {
  const { verdict, next } = input.progress
  if (verdict === "failed" || verdict === "stopped") {
    return "stopped"
  }
  const hasChoices = next.kind === "next" && next.choices.length > 0
  const hasOptions = input.components.some((part) => part.component === "Options")
  if (verdict === "yours" && (hasChoices || hasOptions)) {
    return "decide"
  }
  if (
    input.changedFiles.kind === "none" &&
    input.checks.kind === "none" &&
    input.sectionCount <= 1
  ) {
    return "answer"
  }
  return "deliver"
}
