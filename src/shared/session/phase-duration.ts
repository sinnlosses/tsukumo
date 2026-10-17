// 同じ依頼のワークプランの記録から、段ごとの所要時間を求める決まり。

import { groupBy } from "remeda"

import type { PhaseDuration, PhaseTimeRow } from "../report/report-phase-time.ts"
import type { MeasuredTime } from "../utils/elapsed-time.ts"
import { type RecordTime, recordTimeAt, type SessionRecord } from "./session-state.ts"
import {
  finishedPhaseCount,
  phaseLabel,
  type PhaseNumber,
  phaseNumberOf,
  phaseOrdinalText,
  type PlannedPhase,
  plannedPhasesOf,
} from "./work-plan.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>

/**
 * 同じ依頼のワークプランの記録 `plans`（積まれた順）から、最後の段の並びの段ごとの所要時間。ワークプランが無ければ空。
 *
 * 段の区間は、その段が今の段の集合に入った記録の時刻から、集合を出た記録の時刻（全部済みも含む）まで。
 * 並列の段の中の段は並列の段に入った時刻から一斉に始まり、それぞれ自分が済んだ時刻で終わるので、重なって走った段もそれぞれの所要が出る。
 * 並列の段の行の `wall` は、今の要素がその並列の段だった区間（壁時計）。
 * 最後まで今だった段は `closedAt` で閉じる。同じ段に2回入ったら区間を足す。
 * 段は名前と、同じ名前の段の中で何番目かで追い、並列の段は中の段の名前の並びで追うので、
 * 組み替えても並びに残った段の時間は引き継がれ、並びから消えた段は出さない。
 *
 * 次の段は `unknown`: 一度も今の段にならなかった段、端が `restored` の区間を含む段、
 * 依頼の最初の記録が途中の位置で始まったときに今だった段と並列の段（前の依頼で始まっていて始まりを測れない）。
 */
export function phaseDurations(
  plans: readonly WorkPlanRecord[],
  closedAt: RecordTime,
): readonly PhaseTimeRow[] {
  const last = plans.at(-1)
  if (last === undefined) {
    return []
  }
  const phaseTiming = timingsOf(plans, closedAt, currentPhaseKeysOf)
  const groupTiming = timingsOf(plans, closedAt, currentGroupKeysOf)
  const phases = plannedPhasesOf(last)
  const rowOf = (phase: PlannedPhase): PhaseDuration => ({
    label: phaseLabel({
      kind: "phase",
      indexes: [phase.index],
      count: phases.length,
      name: phase.name,
      range: last.delegatedRange,
    }),
    ...phaseTiming(phase.key),
  })
  return last.phases.flatMap((entry, position): readonly PhaseTimeRow[] => {
    const members = phases.filter((phase) => phase.entry === position)
    if (typeof entry === "string") {
      return members.map((phase) => ({ kind: "phase", ...rowOf(phase) }))
    }
    return [
      {
        kind: "parallel",
        label: parallelLabel(
          phaseNumberOf(
            last.delegatedRange,
            members.map((phase) => phase.index),
            phases.length,
          ),
        ),
        ...wallOf(groupTiming(groupKeyOf(entry))),
        phases: members.map(rowOf),
      },
    ]
  })
}

/**
 * 段の見出し `label` の段の所要（{@link phaseDurations} と同じ求め方。並列の段の中の段も探す）。
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

/**
 * 段の `key`（{@link PlannedPhase}）から、その段の所要を引く関数（{@link phaseDurations} と同じ求め方）。
 * 今の段は `closedAt` までの経過になる。
 */
export function phaseDurationOf(
  plans: readonly WorkPlanRecord[],
  closedAt: RecordTime,
): (key: string) => MeasuredTime {
  const timingOf = timingsOf(plans, closedAt, currentPhaseKeysOf)
  return (key) => timingOf(key).duration
}

const UNKNOWN = { kind: "unknown" } as const satisfies MeasuredTime

type Timing = {
  readonly start: MeasuredTime
  readonly duration: MeasuredTime
}

function wallOf({ start, duration }: Timing): {
  readonly start: MeasuredTime
  readonly wall: MeasuredTime
} {
  return { start, wall: duration }
}

/**
 * `keysOf` が記録ごとに返す今の鍵の集合から、鍵ごとの開始と、区間を足した所要を引く関数。
 * 開始は依頼の最初の記録の時刻からのミリ秒で、同じ鍵の最初の区間の始まり。
 */
function timingsOf(
  plans: readonly WorkPlanRecord[],
  closedAt: RecordTime,
  keysOf: (record: WorkPlanRecord) => ReadonlySet<string>,
): (key: string) => Timing {
  const opensMidway = plans[0] !== undefined && finishedPhaseCount(plans[0]) > 0
  const origin = plans[0]?.time
  const keys = plans.map(keysOf)
  const stints = keys.flatMap((current, index) =>
    [...current]
      .filter((key) => keys[index - 1]?.has(key) !== true)
      .map((key) => {
        const leftAt = keys.findIndex((later, at) => at > index && !later.has(key))
        const end = leftAt < 0 ? closedAt : (plans[leftAt]?.time ?? closedAt)
        const start = plans[index]?.time ?? closedAt
        const unmeasured = index === 0 && opensMidway
        return {
          key,
          start: unmeasured || origin === undefined ? UNKNOWN : spanOf(origin, start),
          duration: unmeasured ? UNKNOWN : spanOf(start, end),
        }
      }),
  )
  const byKey = groupBy(stints, (stint) => stint.key)
  return (key) => {
    const found = byKey[key] ?? []
    return {
      start: found[0]?.start ?? UNKNOWN,
      duration: totalOf(found.map((stint) => stint.duration)),
    }
  }
}

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

/** 並列の段の鍵。中の段の名前の並び。段の鍵とは別の集合でだけ使う。 */
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

function parallelLabel(number: PhaseNumber): string {
  const ordinal = phaseOrdinalText(number)
  return ordinal === "" ? "並列" : `並列 ${ordinal}`
}
