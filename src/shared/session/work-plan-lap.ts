// ワークプランの段ごとの周（やり直しの回数）を数える決まりと、記録の並びから周の境目を引く決まり。周は段の中に積み、段の数は増やさない。

import type { RecordTime } from "./session-record.ts"
import type { WorkPlanTrail } from "./work-plan-trail.ts"
import { plannedPhasesOf, type LatestWorkPlan, type WorkPlan } from "./work-plan.ts"

type LapSource = Parameters<typeof plannedPhasesOf>[0]

/**
 * 差し戻された周1つ。`lap` は差し戻された周の数（1周目なら 1）。
 * `startedAt` は周の始まり（1周目は段が初めて今の段になった記録の時刻、2周目からは前の差し戻しの時刻）、
 * `rejectedAt` は周が進んだ記録の時刻、`reason` はその記録の `redoReason`（無ければ空）。
 */
export type WorkPlanLapEntry = {
  readonly lap: number
  readonly startedAt: RecordTime
  readonly rejectedAt: RecordTime
  readonly reason: string
}

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

/**
 * 記録の並び `trail`（引き継いだ区間も含めて古い順）の隣どうしを比べ、周が進んだ段の `key` ごとの {@link WorkPlanLapEntry}（古い順）。
 * 周が一度も進んでいない段は入らない。
 */
export function lapEntriesOf(
  trail: WorkPlanTrail,
): ReadonlyMap<string, readonly WorkPlanLapEntry[]> {
  const plans = [...trail.carried.flatMap((stretch) => stretch.plans), ...trail.plans]
  const phases = plans.map((record) => ({ record, phases: plannedPhasesOf(record) }))
  return phases.reduce<LapWalk>(
    (walk, { record, phases: current }, index) => {
      const before = new Map(
        (phases[index - 1]?.phases ?? []).map((phase) => [phase.key, phase.lap] as const),
      )
      return current.reduce<LapWalk>((inner, phase) => {
        const startedAt = inner.startedAt.get(phase.key)
        if (phase.lap <= (before.get(phase.key) ?? 1)) {
          return phase.state === "current" && startedAt === undefined
            ? { ...inner, startedAt: new Map([...inner.startedAt, [phase.key, record.time]]) }
            : inner
        }
        const entry: WorkPlanLapEntry = {
          lap: phase.lap - 1,
          startedAt: startedAt ?? record.time,
          rejectedAt: record.time,
          reason: record.redoReason ?? "",
        }
        return {
          startedAt: new Map([...inner.startedAt, [phase.key, record.time]]),
          entries: new Map([
            ...inner.entries,
            [phase.key, [...(inner.entries.get(phase.key) ?? []), entry]],
          ]),
        }
      }, walk)
    },
    { startedAt: new Map(), entries: new Map() },
  ).entries
}

/** {@link lapEntriesOf} がなぞる途中の、段ごとの今の周の始まりと、積んだ境目。 */
type LapWalk = {
  readonly startedAt: ReadonlyMap<string, RecordTime>
  readonly entries: ReadonlyMap<string, readonly WorkPlanLapEntry[]>
}
