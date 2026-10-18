// 同じ依頼のワークプランの記録から、段ごとの所要と段のまとめを引く決まり。

import type { MeasuredTime } from "../utils/elapsed-time.ts"
import { phaseDurationOf } from "./phase-duration.ts"
import type { RecordTime, SessionRecord } from "./session-record.ts"
import { workPlanOf } from "./work-plan-fold.ts"
import { shiftedPhaseOf } from "./work-plan-shift.ts"
import { type LatestWorkPlan, plannedPhasesOf } from "./work-plan.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>

/** 段1つの所要（{@link phaseDurationOf}）と段のまとめ（無ければ空の文字列）。 */
export type PhaseRecap = {
  readonly duration: MeasuredTime
  readonly summary: string
}

/**
 * 同じ依頼のワークプランの記録 `plans`（積まれた順）から、最後の段の並びの段の `key` ごとの {@link PhaseRecap}。
 * まとめは隣どうしの記録を {@link shiftedPhaseOf} に通して済んだ段に載せ、同じ段が2回済めば後のまとめ。
 */
export function phaseRecapsOf(
  plans: readonly WorkPlanRecord[],
  closedAt: RecordTime,
): ReadonlyMap<string, PhaseRecap> {
  const last = plans.at(-1)
  if (last === undefined) {
    return new Map()
  }
  const durationOf = phaseDurationOf(plans, closedAt)
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
