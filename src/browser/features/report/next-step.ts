// レポートの本文から次の一手を作る口。並びを描くのは会話の画面の側（入力欄の頭）。

import { readyTasksInOrder } from "../../../shared/recommendation/recommendation-order.ts"
import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import type { MainViewReportBody } from "../../../shared/session/main-view-shape.ts"
import {
  buildNextSteps,
  type NextStep,
  type NextStepsOrigin,
  type NextTaskCandidate,
} from "./domain/next-step-plan.ts"

export type { NextStep, NextStepsOrigin }

/** 着手できるタスクをおすすめの順に、終えたばかりのタスクを除いて並べる。一覧が届いていなければ空。 */
export function nextTaskCandidatesOf(
  tasks: TaskSummaryResult,
  finishedTaskId: string,
): readonly NextTaskCandidate[] {
  return readyTasksInOrder(tasks)
    .filter((task) => task.id !== finishedTaskId)
    .map((task) => ({ id: task.id, summary: task.summary }))
}

/** 部品の一覧で描かない本文（`markdown`）からは作らない。 */
export function nextStepsOfReport(
  report: MainViewReportBody,
  origin: NextStepsOrigin,
): readonly NextStep[] {
  if (report.kind === "markdown") {
    return []
  }
  return buildNextSteps({
    components: report.a2ui.kind === "surface" ? report.a2ui.components : [],
    ...origin,
  })
}
