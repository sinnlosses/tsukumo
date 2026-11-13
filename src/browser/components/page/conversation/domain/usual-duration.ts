// 「いつもは」の所要から、紙に出す見込み（「あと約 4分（似た段 9 件の中央値から）」）と、
// これからの段の幅（「似た作業では 2〜4分」）の字を組む決まり。件数が足りない塊があれば出さない。

import { uniqueBy } from "remeda"

import { phaseSpanOf } from "../../../../../shared/session/work-plan-phase-number.ts"
import { plannedPhasesOf, type PlannedWorkPlan } from "../../../../../shared/session/work-plan.ts"
import type { UsualDurations, UsualSpread } from "../../../../../shared/usage/usual-duration.ts"
import type { MeasuredTime } from "../../../../../shared/utils/elapsed-time.ts"

/** 出すか出さないか。出すときだけ字を持つ。 */
export type UsualText =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

/** 見込みの材料にする行（`WorkPlanRow` のうち要る欄）。 */
export type EstimatedRow = {
  readonly key: string
  readonly state: "done" | "current" | "upcoming" | "skipped"
  readonly duration: MeasuredTime
}

export const NO_USUAL_TEXT = { kind: "none" } as const satisfies UsualText

/** これからの段の幅「似た作業では 2〜4分」。件数が足りなければ出さない。 */
export function usualRangeText(spread: UsualSpread): UsualText {
  if (spread.kind === "empty") {
    return NO_USUAL_TEXT
  }
  const low = minutesOf(spread.lowSeconds)
  const high = minutesOf(spread.highSeconds)
  return {
    kind: "shown",
    text:
      low === high
        ? `似た作業では約 ${String(low)}分`
        : `似た作業では ${String(low)}〜${String(high)}分`,
  }
}

/**
 * 残りの段（今の段とこれからの段）の見込み「あと約 4分（似た段 9 件の中央値から）」。
 * 残りの段の群ごとの中央値を足し、今の段は経った分を引く（引きすぎたら 0）。
 * 残りの段の群が1つでも件数不足なら出さない。残りの段が無ければ出さない。
 */
export function remainingEstimate(
  plan: PlannedWorkPlan,
  rows: readonly EstimatedRow[],
  usual: UsualDurations,
): UsualText {
  const spanByKey = new Map(
    plannedPhasesOf(plan).map((phase) => [phase.key, phaseSpanOf(plan, phase)]),
  )
  const remaining = rows.flatMap((row) => {
    const span = spanByKey.get(row.key)
    return (row.state === "current" || row.state === "upcoming") && span !== undefined
      ? [{ row, span, spread: usual.phases[span] }]
      : []
  })
  if (remaining.length === 0) {
    return NO_USUAL_TEXT
  }
  const measured = remaining.flatMap(({ row, span, spread }) =>
    spread.kind === "measured" ? [{ row, span, spread }] : [],
  )
  if (measured.length < remaining.length) {
    return NO_USUAL_TEXT
  }
  const seconds = measured.reduce((total, { row, spread }) => {
    const spent =
      row.state === "current" && row.duration.kind === "known"
        ? row.duration.milliseconds / 1000
        : 0
    return total + Math.max(0, spread.medianSeconds - spent)
  }, 0)
  const count = uniqueBy(measured, ({ span }) => span).reduce(
    (total, { spread }) => total + spread.count,
    0,
  )
  return {
    kind: "shown",
    text: `あと約 ${String(minutesOf(seconds))}分（似た段 ${String(count)} 件の中央値から）`,
  }
}

/** 分に丸めた数。1分に満たなくても 1。 */
export function minutesOf(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60))
}
