// `report` の段の閉じ方（`workPlanClosing`）が、同じ依頼のワークプランの残りの段と合うかの判定。

import type { ReportTask } from "../../../shared/report/report-task.ts"
import {
  type ProcedureRejection,
  REPORT_FINISHED_BUT_STOPPED_REJECTION_TEXT,
  REPORT_MISSING_WORK_PLAN_CLOSING_REJECTION_TEXT,
  REPORT_UNFINISHED_PHASES_REJECTION_TEXT,
} from "./procedure-rejection.ts"
import type { ReportDraft } from "./report-violation.ts"

/** 段の閉じ方の判定。合わなければ、当てはまった条の名前と差し戻しの文面。 */
export type ClosingFit =
  | { readonly kind: "fit" }
  | {
      readonly kind: "unfit"
      readonly reason: ProcedureRejection
      readonly text: string
    }

/** 同じ依頼にワークプランがあるときの、段の閉じ方だけで見た判定。`remaining` は済んでいない段の数（全部済みなら 0）。 */
export function judgeWorkPlanClosing(report: ReportDraft, remaining: number): ClosingFit {
  if (report.workPlanClosing === "none") {
    return {
      kind: "unfit",
      reason: "missing-work-plan-closing",
      text: REPORT_MISSING_WORK_PLAN_CLOSING_REJECTION_TEXT,
    }
  }
  if (report.workPlanClosing === "finished" && remaining >= 2) {
    return {
      kind: "unfit",
      reason: "unfinished-phases",
      text: REPORT_UNFINISHED_PHASES_REJECTION_TEXT,
    }
  }
  if (report.workPlanClosing === "stopped" && remaining > 0 && isFinished(report.task)) {
    return {
      kind: "unfit",
      reason: "finished-but-stopped",
      text: REPORT_FINISHED_BUT_STOPPED_REJECTION_TEXT,
    }
  }
  return { kind: "fit" }
}

/** 作業を終えた（`task.outcome` が `finished`）`report` か。 */
export function isFinished(task: ReportTask): boolean {
  return task.kind === "task" && task.outcome === "finished"
}
