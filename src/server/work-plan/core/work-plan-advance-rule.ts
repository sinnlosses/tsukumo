// 受け付け済みのワークプランから次の `work_plan` への進み方（段の一足飛び・返却のまとめの写し）の判定。

import { isDeepEqual } from "remeda"

import {
  finishedPhaseCount,
  type LatestWorkPlan,
  type WorkPlan,
} from "../../../shared/session/work-plan.ts"

/**
 * 返却の `summary` がまとめを運んだ段に、メインが同じ位置で写す `work_plan` か。
 * 当たれば、メインが `phaseSummary` を渡さなくても途中の呼び出しを差し戻さない（渡してあっても、中間レポートに出るのは返却のまとめ）。
 */
export function writesReturnedSummary(
  previous: LatestWorkPlan,
  next: WorkPlan,
  summaryReturned: boolean,
): boolean {
  return (
    summaryReturned &&
    previous.kind === "planned" &&
    isDeepEqual(previous.phases, next.phases) &&
    finishedPhaseCount(previous) === finishedPhaseCount(next)
  )
}

export function skipsPhase(previous: WorkPlan, next: WorkPlan): boolean {
  return gainedPhases(previous, next) > 1
}

/** 同じ段の並びのまま、済んだ段が増えた数。並びが変わっていれば 0。 */
function gainedPhases(previous: WorkPlan, next: WorkPlan): number {
  return isDeepEqual(previous.phases, next.phases)
    ? finishedPhaseCount(next) - finishedPhaseCount(previous)
    : 0
}
