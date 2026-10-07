// 同じ依頼の段取りの記録から、段ごとの所要時間を求める決まり。

import { groupBy } from "remeda"

import type { PhaseDuration, PhaseTimeRow } from "../report/report-phase-time.ts"
import type { MeasuredTime } from "../utils/elapsed-time.ts"
import { type RecordTime, recordTimeAt, type SessionRecord } from "./session-state.ts"
import { finishedPhaseCount, phaseLabel, type PlannedPhase, plannedPhasesOf } from "./work-plan.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>

/**
 * 同じ依頼の段取りの記録 `plans`（積まれた順）から、最後の段の並びの段ごとの所要時間。段取りが無ければ空。
 *
 * 段の区間は、その段が今の段の集合に入った記録の時刻から、集合を出た記録の時刻（全部済みも含む）まで。
 * 段のまとまりの段はまとまりに入った時刻から一斉に始まり、それぞれ自分が済んだ時刻で終わるので、重なって走った段もそれぞれの所要が出る。
 * まとまりの行の `wall` は、今の要素がそのまとまりだった区間（壁時計）。
 * 最後まで今だった段は `closedAt` で閉じる。同じ段に2回入ったら区間を足す。
 * 段は名前と、同じ名前の段の中で何番目かで追い、まとまりは中の段の名前の並びで追うので、
 * 組み替えても並びに残った段の時間は引き継がれ、並びから消えた段は出さない。
 *
 * 次の段は `unknown`: 一度も今の段にならなかった段、端が `restored` の区間を含む段、
 * 依頼の最初の記録が途中の位置で始まったときに今だった段とまとまり（前の依頼で始まっていて始まりを測れない）。
 */
export function phaseDurations(
  plans: readonly WorkPlanRecord[],
  closedAt: RecordTime,
): readonly PhaseTimeRow[] {
  const last = plans.at(-1)
  if (last === undefined) {
    return []
  }
  const opensMidway = plans[0] !== undefined && finishedPhaseCount(plans[0]) > 0
  const durationsOf = (keysOf: (record: WorkPlanRecord) => ReadonlySet<string>) => {
    const keys = plans.map(keysOf)
    const stints = keys.flatMap((current, index) =>
      [...current]
        .filter((key) => keys[index - 1]?.has(key) !== true)
        .map((key) => {
          const leftAt = keys.findIndex((later, at) => at > index && !later.has(key))
          const end = leftAt < 0 ? closedAt : (plans[leftAt]?.time ?? closedAt)
          const start = plans[index]?.time ?? closedAt
          return {
            key,
            duration: index === 0 && opensMidway ? UNKNOWN : spanOf(start, end),
          }
        }),
    )
    const byKey = groupBy(stints, (stint) => stint.key)
    return (key: string) => totalOf((byKey[key] ?? []).map((stint) => stint.duration))
  }
  const phaseDuration = durationsOf(currentPhaseKeysOf)
  const groupDuration = durationsOf(currentGroupKeysOf)
  const phases = plannedPhasesOf(last)
  const rowOf = (phase: PlannedPhase): PhaseDuration => ({
    label: phaseLabel({
      kind: "phase",
      indexes: [phase.index],
      count: phases.length,
      name: phase.name,
    }),
    duration: phaseDuration(phase.key),
  })
  return last.phases.flatMap((entry, position): readonly PhaseTimeRow[] => {
    const members = phases.filter((phase) => phase.entry === position)
    if (typeof entry === "string") {
      return members.map((phase) => ({ kind: "phase", ...rowOf(phase) }))
    }
    return [
      {
        kind: "parallel",
        label: `並列 ${members.map((phase) => String(phase.index + 1)).join("·")}`,
        wall: groupDuration(groupKeyOf(entry)),
        phases: members.map(rowOf),
      },
    ]
  })
}

/**
 * 段の見出し `label` の段の所要（{@link phaseDurations} と同じ求め方。まとまりの中の段も探す）。
 * その段が最後の段の並びに無ければ `unknown`。
 */
export function finishedPhaseDuration(
  plans: readonly WorkPlanRecord[],
  label: string,
  closedAt: RecordTime,
): MeasuredTime {
  return (
    phaseDurations(plans, closedAt)
      .flatMap((row) => (row.kind === "phase" ? [row] : row.phases))
      .find((found) => found.label === label)?.duration ?? UNKNOWN
  )
}

const UNKNOWN = { kind: "unknown" } as const satisfies MeasuredTime

function currentPhaseKeysOf(record: WorkPlanRecord): ReadonlySet<string> {
  return new Set(
    plannedPhasesOf(record)
      .filter((phase) => phase.state === "current")
      .map((phase) => phase.key),
  )
}

function currentGroupKeysOf(record: WorkPlanRecord): ReadonlySet<string> {
  const entry = record.phases[record.current]
  return new Set(entry === undefined || typeof entry === "string" ? [] : [groupKeyOf(entry)])
}

/** まとまりの鍵。中の段の名前の並び。段の鍵とは別の集合でだけ使う。 */
function groupKeyOf(group: readonly string[]): string {
  return group.join("\u0000")
}

function spanOf(start: RecordTime, end: RecordTime): MeasuredTime {
  const startAt = recordTimeAt(start)
  const endAt = recordTimeAt(end)
  return startAt === undefined || endAt === undefined
    ? UNKNOWN
    : { kind: "known", milliseconds: endAt - startAt }
}

/** 区間の足し算。区間が無いか、1つでも `unknown` なら `unknown`。 */
function totalOf(durations: readonly MeasuredTime[]): MeasuredTime {
  if (durations.length === 0) {
    return UNKNOWN
  }
  return durations.reduce<MeasuredTime>(
    (total, duration) =>
      total.kind === "known" && duration.kind === "known"
        ? { kind: "known", milliseconds: total.milliseconds + duration.milliseconds }
        : UNKNOWN,
    { kind: "known", milliseconds: 0 },
  )
}
