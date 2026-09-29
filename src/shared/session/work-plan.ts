// 段取り（`work_plan` ツールで受け取る段の並びと今の位置）の形と、記録から段取りを導く決まり。
// 状態に別の入れ物は持たず、`work-plan` の記録から描くたびに導く。

import { isPlainObject } from "remeda"

import type { SessionRecord } from "./session-state.ts"

/** 段の並びと今の位置。`current` は0始まりで、全部の段が済んだら `phases.length`。 */
export type WorkPlan = {
  readonly phases: readonly string[]
  readonly current: number
}

/** 段取りが持つ段の数の下限。段が無い段取りは位置を言う意味が無いので受け付けない。 */
export const MIN_WORK_PLAN_PHASES = 1

/** 記録の範囲で最後に渡された段取り。1度も渡されていなければ `none`。 */
export type LatestWorkPlan = { readonly kind: "none" } | ({ readonly kind: "planned" } & WorkPlan)

/**
 * 手順1件が始まったときの段。
 * 段取りがまだ無い・全部の段が済んだあとなら `none`。`index` は0始まりで、`count` は段の数。
 */
export type WorkPhase =
  | { readonly kind: "none" }
  | {
      readonly kind: "phase"
      readonly index: number
      readonly count: number
      readonly name: string
    }

/**
 * 外来の値（ツールの引数・transcript）を段取りとして読む。
 * 段が {@link MIN_WORK_PLAN_PHASES} 個より少ない・空白だけの名前がある・位置が0から段の数までの整数でないときは undefined。
 * ツールの handler が差し戻すかどうかと、変換がイベントにするかどうかは、この1つで決まる。
 */
export function parseWorkPlan(value: unknown): WorkPlan | undefined {
  if (!isPlainObject(value) || !Array.isArray(value.phases)) {
    return undefined
  }
  const phases = value.phases.filter(
    (phase): phase is string => typeof phase === "string" && phase.trim() !== "",
  )
  const { current } = value
  if (
    phases.length !== value.phases.length ||
    phases.length < MIN_WORK_PLAN_PHASES ||
    typeof current !== "number" ||
    !Number.isInteger(current) ||
    current < 0 ||
    current > phases.length
  ) {
    return undefined
  }
  return { phases, current }
}

/** 記録の範囲で最後の `work-plan` の記録（{@link LatestWorkPlan}）。範囲を依頼1つに絞るのは呼ぶ側。 */
export function latestWorkPlan(records: readonly SessionRecord[]): LatestWorkPlan {
  const found = records.findLast(isWorkPlanRecord)
  return found === undefined
    ? { kind: "none" }
    : { kind: "planned", phases: found.phases, current: found.current }
}

/** 段取りの今の段（{@link WorkPhase}）。 */
export function currentPhaseOf(plan: LatestWorkPlan): WorkPhase {
  if (plan.kind === "none") {
    return { kind: "none" }
  }
  const name = plan.phases[plan.current]
  return name === undefined
    ? { kind: "none" }
    : { kind: "phase", index: plan.current, count: plan.phases.length, name }
}

function isWorkPlanRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "work-plan" }> {
  return record.kind === "work-plan"
}
