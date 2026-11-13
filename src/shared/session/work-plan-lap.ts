// ワークプランの段ごとの周（やり直しの回数）を数える決まり。周は段の中に積み、段の数は増やさない。

import { plannedPhasesOf, type LatestWorkPlan, type WorkPlan } from "./work-plan.ts"

type LapSource = Parameters<typeof plannedPhasesOf>[0]

/**
 * `next` の平らにした並びの周。名前と同じ名前の中の順（`PlannedPhase` の `key`）で前の周を引き継ぎ、
 * 前に済んでいた段が `next` で今の段になっていれば（済んだ段へ戻した）その段の周を 1 進める。
 * 前のワークプランが無い・引き継げない段は 1。
 */
export function nextPhaseLaps(previous: LatestWorkPlan, next: WorkPlan): readonly number[] {
  const before = new Map(
    previous.kind === "planned"
      ? plannedPhasesOf(previous).map((phase) => [phase.key, phase] as const)
      : [],
  )
  return plannedPhasesOf(next).map((phase) => {
    const earlier = before.get(phase.key)
    const lap = earlier?.lap ?? 1
    return earlier?.state === "done" && phase.state === "current" ? lap + 1 : lap
  })
}

/** `plan` の `index` の段の周を 1 進めた周の並び。`phase_result` の `redo` が使う。 */
export function lapsWithRedo(plan: LapSource, index: number): readonly number[] {
  return plannedPhasesOf(plan).map((phase) => (phase.index === index ? phase.lap + 1 : phase.lap))
}
