// 同じ依頼の段取りの記録から、段ごとの所要時間を求める決まり。

import { groupBy } from "remeda"

import type { PhaseDuration } from "../report/report-phase-time.ts"
import type { MeasuredTime } from "../utils/elapsed-time.ts"
import type { RecordTime, SessionRecord } from "./session-state.ts"
import { phaseLabel } from "./work-plan.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>

/**
 * 同じ依頼の段取りの記録 `plans`（積まれた順）から、最後の段の並びの段ごとの所要時間。段取りが無ければ空。
 *
 * 段に入った時刻は、今の段が前の記録と変わった記録の時刻で、次に別の段へ移った時刻（全部済みも含む）までをその段の時間にする。
 * 最後に今だった段は `closedAt` で閉じる。同じ段に2回入ったら区間を足す。
 * 段は名前と、同じ名前の段の中で何番目かで追うので、組み替えても並びに残った段の時間は引き継がれ、並びから消えた段は出さない。
 *
 * 次の段は `unknown`: 一度も今の段にならなかった段、端が `restored` の区間を含む段、
 * 依頼の最初の記録が途中の位置で始まったときのその段（前の依頼で始まっていて始まりを測れない）。
 */
export function phaseDurations(
  plans: readonly WorkPlanRecord[],
  closedAt: RecordTime,
): readonly PhaseDuration[] {
  const last = plans.at(-1)
  if (last === undefined) {
    return []
  }
  const entries = plans.flatMap((record, index) => {
    const key = currentKeyOf(record)
    const previous = plans[index - 1]
    return previous !== undefined && currentKeyOf(previous) === key
      ? []
      : [{ key, time: record.time, opensMidway: index === 0 && record.current > 0 }]
  })
  const stints = entries.map((entry, index) => ({
    key: entry.key,
    duration: entry.opensMidway
      ? UNKNOWN
      : spanOf(entry.time, entries[index + 1]?.time ?? closedAt),
  }))
  const stintsByKey = groupBy(stints, (stint) => stint.key)
  return last.phases.map((name, index) => ({
    label: phaseLabel({ kind: "phase", index, count: last.phases.length, name }),
    duration: totalOf(
      (stintsByKey[phaseKeyOf(last.phases, name, index)] ?? []).map((stint) => stint.duration),
    ),
  }))
}

/**
 * 段の見出し `label` の段の所要（{@link phaseDurations} と同じ求め方）。
 * その段が最後の段の並びに無ければ `unknown`。
 */
export function finishedPhaseDuration(
  plans: readonly WorkPlanRecord[],
  label: string,
  closedAt: RecordTime,
): MeasuredTime {
  return phaseDurations(plans, closedAt).find((found) => found.label === label)?.duration ?? UNKNOWN
}

/** 全部の段が済んだ位置の鍵。段の鍵は空白だけの名前を含まないので、どの段の鍵とも重ならない。 */
const ALL_DONE = ""

const UNKNOWN = { kind: "unknown" } as const satisfies MeasuredTime

/** 記録の今の段の鍵（全部済みなら {@link ALL_DONE}）。 */
function currentKeyOf(record: WorkPlanRecord): string {
  const name = record.phases[record.current]
  return name === undefined ? ALL_DONE : phaseKeyOf(record.phases, name, record.current)
}

/** `index` 番目の段 `name` の鍵。名前と、同じ名前の段の中で何番目かの組。 */
function phaseKeyOf(phases: readonly string[], name: string, index: number): string {
  const occurrence = phases.slice(0, index).filter((other) => other === name).length
  return `${name}\u0000${String(occurrence)}`
}

function spanOf(start: RecordTime, end: RecordTime): MeasuredTime {
  return start.kind === "stamped" && end.kind === "stamped"
    ? { kind: "known", milliseconds: end.at - start.at }
    : UNKNOWN
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
