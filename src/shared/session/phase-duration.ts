// ワークプランの記録の並び（止めて再開した依頼をまたいでつないだもの）から、段ごとの所要時間を求める決まり。

import { groupBy } from "remeda"

import type { PhaseAbsence, PhaseDuration, PhaseTimeRow } from "../report/report-phase-time.ts"
import type { MeasuredTime } from "../utils/elapsed-time.ts"
import { type RecordTime, recordTimeAt, type SessionRecord } from "./session-record.ts"
import {
  phaseLabel,
  type PhaseNumber,
  phaseNumberOf,
  phaseOrdinalText,
} from "./work-plan-phase-number.ts"
import type { WorkPlanStretch, WorkPlanTrail } from "./work-plan-trail.ts"
import {
  finishedPhaseCount,
  type PlannedPhase,
  plannedPhasesOf,
  type WorkPlanClosing,
} from "./work-plan.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>

/**
 * 記録の並び `trail` から、今の依頼の最後の段の並びの段ごとの所要時間。今の依頼にワークプランが無ければ空。
 *
 * 段の区間は、その段が今の段の集合に入った記録の時刻から、集合を出た記録の時刻（全部済みも含む）まで。
 * 並列の段の中の段は並列の段に入った時刻から一斉に始まり、それぞれ自分が済んだ時刻で終わるので、重なって走った段もそれぞれの所要が出る。
 * 並列の段の行の `wall` は、今の要素がその並列の段だった区間（壁時計）。
 * 今の依頼で最後まで今だった段は `closedAt` で、引き継いだ区間で最後まで今だった段はその区間の `closedAt` で閉じる。
 * 同じ段に2回入ったら区間を足すので、止めて再開した段は前後の区間の和になり、あいだの待ちは入らない。
 * `start` は待ちを抜いた時間の軸で、前の区間の長さの和にその区間の中の開始を足した位置。
 * 段は名前と、同じ名前の段の中で何番目かで追い、並列の段は中の段の名前の並びで追うので、
 * 組み替えても並びに残った段の時間は引き継がれ、並びから消えた段は出さない。
 *
 * 時間を出さない段は `duration` が `unknown` で、理由を `absence` に持つ。
 * `skipped`: 最後の記録の `skippedPhases` の段（区間が測れていても）。
 * `not-started`: `closing` が `stopped` で、引き継いだ区間を含めて一度も今の段にならず、最後の記録で済んでいない段。
 * `none` の `unknown`: 一度も今の段にならなかった段のうち上のどちらでもないもの、端が `restored` の区間を含む段、
 * 並び全体の最初の記録が途中の位置で始まったときに今だった段と並列の段（始まりがこの並びの外にあって測れない）。
 * 並列の段の行は、中の段が全部 `not-started` なら `not-started`、全部 `skipped` なら `skipped`。
 */
export function phaseDurations(
  trail: WorkPlanTrail,
  closedAt: RecordTime,
  closing: WorkPlanClosing,
): readonly PhaseTimeRow[] {
  return rowsOf(trail, closedAt, (phase, entered) => absenceOf(phase, entered, closing))
}

/**
 * 段の見出し `label` の段の所要（{@link phaseDurations} と同じ求め方で、飛ばした段も区間の長さを返す。並列の段の中の段も探す）。
 * その段が最後の段の並びに無ければ `unknown`。
 */
export function finishedPhaseDuration(
  trail: WorkPlanTrail,
  label: string,
  closedAt: RecordTime,
): MeasuredTime {
  return (
    rowsOf(trail, closedAt, () => "none")
      .flatMap((row) => (row.kind === "phase" ? [row] : row.phases))
      .find((found) => found.label === label)?.duration ?? UNKNOWN
  )
}

/**
 * 段の `key`（{@link PlannedPhase}）から、その段の所要を引く関数（{@link phaseDurations} と同じ求め方）。
 * 今の段は `closedAt` までの経過になる。
 */
export function phaseDurationOf(
  trail: WorkPlanTrail,
  closedAt: RecordTime,
): (key: string) => MeasuredTime {
  const timingOf = timingsOf(trail, closedAt, currentPhaseKeysOf)
  return (key) => timingOf(key).duration
}

type AbsenceOf = (phase: PlannedPhase, entered: boolean) => PhaseAbsence

function rowsOf(
  trail: WorkPlanTrail,
  closedAt: RecordTime,
  absenceFor: AbsenceOf,
): readonly PhaseTimeRow[] {
  const last = trail.plans.at(-1)
  if (last === undefined) {
    return []
  }
  const phaseTiming = timingsOf(trail, closedAt, currentPhaseKeysOf)
  const groupTiming = timingsOf(trail, closedAt, currentGroupKeysOf)
  const phases = plannedPhasesOf(last)
  const rowOf = (phase: PlannedPhase): PhaseDuration => {
    const { start, duration, entered } = phaseTiming(phase.key)
    const absence = absenceFor(phase, entered)
    return {
      label: phaseLabel({
        kind: "phase",
        indexes: [phase.index],
        count: phases.length,
        name: phase.name,
        range: last.delegatedRange,
      }),
      start,
      duration: absence === "none" ? duration : UNKNOWN,
      absence,
    }
  }
  return last.phases.flatMap((entry, position): readonly PhaseTimeRow[] => {
    const members = phases.filter((phase) => phase.entry === position)
    if (typeof entry === "string") {
      return members.map((phase) => ({ kind: "phase", ...rowOf(phase) }))
    }
    const inner = members.map(rowOf)
    const absence = groupAbsenceOf(inner)
    const { start, wall } = wallOf(groupTiming(groupKeyOf(entry)))
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
        start,
        wall: absence === "none" ? wall : UNKNOWN,
        absence,
        phases: inner,
      },
    ]
  })
}

const UNKNOWN = { kind: "unknown" } as const satisfies MeasuredTime

const ZERO = { kind: "known", milliseconds: 0 } as const satisfies MeasuredTime

type Timing = {
  readonly start: MeasuredTime
  readonly duration: MeasuredTime
}

/** `entered` は、いずれかの区間で一度でも今の段になったか。 */
type EnteredTiming = Timing & { readonly entered: boolean }

function absenceOf(phase: PlannedPhase, entered: boolean, closing: WorkPlanClosing): PhaseAbsence {
  if (phase.skipped) {
    return "skipped"
  }
  return !entered && phase.state !== "done" && closing === "stopped" ? "not-started" : "none"
}

function groupAbsenceOf(inner: readonly PhaseDuration[]): PhaseAbsence {
  const first = inner[0]?.absence ?? "none"
  return inner.every((phase) => phase.absence === first) ? first : "none"
}

type Stint = Timing & { readonly key: string }

function wallOf({ start, duration }: Timing): {
  readonly start: MeasuredTime
  readonly wall: MeasuredTime
} {
  return { start, wall: duration }
}

/**
 * `keysOf` が記録ごとに返す今の鍵の集合から、鍵ごとの開始と、区間を足した所要を引く関数。
 * 区間は依頼ごと（引き継いだ区間と今の依頼）に数え、区間をまたいで鍵の出入りを続けない。
 */
function timingsOf(
  trail: WorkPlanTrail,
  closedAt: RecordTime,
  keysOf: (record: WorkPlanRecord) => ReadonlySet<string>,
): (key: string) => EnteredTiming {
  const stretches = [...trail.carried, { plans: trail.plans, closedAt }]
  const first = stretches[0]?.plans[0]
  const opensMidway = first !== undefined && finishedPhaseCount(first) > 0
  const offsets = offsetsOf(stretches)
  const stints = stretches.flatMap((stretch, order) =>
    stintsOf(stretch, offsets[order] ?? UNKNOWN, order === 0 && opensMidway, keysOf),
  )
  const byKey = groupBy(stints, (stint) => stint.key)
  return (key) => {
    const found = byKey[key] ?? []
    return {
      start: found[0]?.start ?? UNKNOWN,
      duration: totalOf(found.map((stint) => stint.duration)),
      entered: found.length > 0,
    }
  }
}

/** 区間ごとの、待ちを抜いた時間の軸での頭の位置（前の区間の長さの和）。 */
function offsetsOf(stretches: readonly WorkPlanStretch[]): readonly MeasuredTime[] {
  return stretches
    .slice(0, -1)
    .reduce<readonly MeasuredTime[]>(
      (offsets, previous) => [...offsets, sumOf(offsets.at(-1) ?? UNKNOWN, lengthOf(previous))],
      [ZERO],
    )
}

function lengthOf({ plans, closedAt }: WorkPlanStretch): MeasuredTime {
  const origin = plans[0]?.time
  return origin === undefined ? UNKNOWN : spanOf(origin, closedAt)
}

/** 依頼1つぶんの区間の中の、鍵ごとの区間。`unmeasured` なら最初の記録で今だった鍵は測れない。 */
function stintsOf(
  stretch: WorkPlanStretch,
  offset: MeasuredTime,
  unmeasured: boolean,
  keysOf: (record: WorkPlanRecord) => ReadonlySet<string>,
): readonly Stint[] {
  const { plans, closedAt } = stretch
  const origin = plans[0]?.time
  const keys = plans.map(keysOf)
  return keys.flatMap((current, index) =>
    [...current]
      .filter((key) => keys[index - 1]?.has(key) !== true)
      .map((key) => {
        const leftAt = keys.findIndex((later, at) => at > index && !later.has(key))
        const end = leftAt < 0 ? closedAt : (plans[leftAt]?.time ?? closedAt)
        const start = plans[index]?.time ?? closedAt
        const opensUnmeasured = index === 0 && unmeasured
        return {
          key,
          start:
            opensUnmeasured || origin === undefined
              ? UNKNOWN
              : sumOf(offset, spanOf(origin, start)),
          duration: opensUnmeasured ? UNKNOWN : spanOf(start, end),
        }
      }),
  )
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
  return durations.reduce<MeasuredTime>(sumOf, ZERO)
}

function sumOf(left: MeasuredTime, right: MeasuredTime): MeasuredTime {
  return left.kind === "known" && right.kind === "known"
    ? { kind: "known", milliseconds: left.milliseconds + right.milliseconds }
    : UNKNOWN
}

function parallelLabel(number: PhaseNumber): string {
  const ordinal = phaseOrdinalText(number)
  return ordinal === "" ? "並列" : `並列 ${ordinal}`
}
