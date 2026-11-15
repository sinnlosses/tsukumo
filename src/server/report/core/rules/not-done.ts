// 根の `Report` の `notDone`（やっていないこと）の検査の家族。違反の型・検出・差し戻し文を持つ。
// 「やっていないことが無い」は空の並びで言い、省くことは黙っていることなので、タスクのレポートで省いた件を数える。

import { A2UI_ROOT_ID } from "../../../../shared/report/a2ui-report-outline.ts"
import type { ReportDraft } from "./draft.ts"

export type NotDoneViolation =
  /** `task` を持つレポートで根の `notDone` を省いた。`count` は省いたとき 1。 */
  { readonly kind: "omitted-not-done"; readonly count: number }

/** `notDone` の違反を、当てはまらないもの（`count` が 0）も含めて並べる。 */
export function detectNotDoneViolations(
  report: Pick<ReportDraft, "task" | "components">,
): readonly NotDoneViolation[] {
  const root = report.components.find((part) => part.id === A2UI_ROOT_ID)
  const omitted =
    report.task.kind === "task" && root?.component === "Report" && root.notDone === undefined
  return [{ kind: "omitted-not-done", count: omitted ? 1 : 0 }]
}

export function isNotDoneViolation(violation: {
  readonly kind: string
}): violation is NotDoneViolation {
  return violation.kind === "omitted-not-done"
}

/** `notDone` の違反を、差し戻すときの1行の文面にする。 */
export function notDoneViolationMessage(_violation: NotDoneViolation): string {
  return "`task` を渡したレポートで `notDone`（やっていないこと）を省いている。無いときは空の並びを渡す"
}
