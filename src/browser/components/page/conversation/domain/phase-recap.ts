// ワークプランの記録の並び（止めて再開した依頼をまたいでつないだもの）から、段ごとの所要と段のまとめを引く決まり。

import { phaseDurationOf } from "../../../../../shared/session/phase-duration.ts"
import type { RecordTime } from "../../../../../shared/session/session-record.ts"
import { workPlanOf } from "../../../../../shared/session/work-plan-fold.ts"
import { shiftedPhaseOf } from "../../../../../shared/session/work-plan-shift.ts"
import type { WorkPlanTrail } from "../../../../../shared/session/work-plan-trail.ts"
import { type LatestWorkPlan, plannedPhasesOf } from "../../../../../shared/session/work-plan.ts"
import type { MeasuredTime } from "../../../../../shared/utils/elapsed-time.ts"

/** 段1つの所要（{@link phaseDurationOf}）と段のまとめ（無ければ空の文字列）。 */
export type PhaseRecap = {
  readonly duration: MeasuredTime
  readonly summary: string
}

/**
 * 記録の並び `trail` から、今の依頼の最後の段の並びの段の `key` ごとの {@link PhaseRecap}。
 * まとめは引き継いだ区間の記録も含めて隣どうしの記録を {@link shiftedPhaseOf} に通して済んだ段に載せ、同じ段が2回済めば後のまとめ。
 */
export function phaseRecapsOf(
  trail: WorkPlanTrail,
  closedAt: RecordTime,
): ReadonlyMap<string, PhaseRecap> {
  const last = trail.plans.at(-1)
  if (last === undefined) {
    return new Map()
  }
  const durationOf = phaseDurationOf(trail, closedAt)
  const plans = [...trail.carried.flatMap((stretch) => stretch.plans), ...trail.plans]
  const summaries = new Map(
    plans.flatMap((record, index) => {
      const before = index === 0 ? undefined : plans[index - 1]
      const shifted = shiftedPhaseOf(before === undefined ? NO_PLAN : workPlanOf(before), record)
      return shifted.kind === "finished" ? [[shifted.phase.key, shifted.summary] as const] : []
    }),
  )
  return new Map(
    plannedPhasesOf(last).map((phase) => [
      phase.key,
      { duration: durationOf(phase.key), summary: summaries.get(phase.key) ?? "" },
    ]),
  )
}

const NO_PLAN = { kind: "none" } as const satisfies LatestWorkPlan
