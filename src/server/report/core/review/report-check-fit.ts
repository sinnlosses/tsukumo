// `report` の終わり方と `checks` の行の、手続きの差し戻しが見る当てはまり。

import type { ReportCheck } from "../../../../shared/report/report-check.ts"
import type { ReportDraft } from "../rules/draft.ts"
import { isFinished } from "./work-plan-closing-fit.ts"

/** 作業を終えたと言っている `report`。`task.outcome` が `finished` か、書いた判定が `done`。 */
export function isFinishedReport(
  report: Pick<ReportDraft, "task" | "verdict" | "verdictWritten">,
): boolean {
  return isFinished(report.task) || (report.verdictWritten && report.verdict === "done")
}

/** `ok` の行の `command` が、打った Bash の中に無い。`command` が空白だけの行は当てはまらない。 */
export function isUnrunOkCheck(check: ReportCheck, bashCommands: readonly string[]): boolean {
  return (
    check.status === "ok" && check.command.trim() !== "" && !bashCommands.includes(check.command)
  )
}

export function hasNgCheck(report: Pick<ReportDraft, "checks">): boolean {
  return report.checks.some((check) => check.status === "ng")
}
