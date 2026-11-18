// プログレスバーの目安の残り。同じ依頼の中で済んだ区間の所要の最短と最長から、残りの幅を分で言う（ADR 0070 論点 6）。
// 時計は受けない。今の区間の経過は、呼ぶ側が `phaseDurations` に渡す `closedAt` で決まる。

import type { PhaseTimeRow } from "../../../../../../../shared/report/report-phase-time.ts"

export type RemainingEstimate =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly low: number; readonly high: number }

export type RemainingEstimateInput = {
  /** 区間ごとの所要の行（`phaseDurations`）。ワークプランの要素1つに1行。 */
  readonly rows: readonly PhaseTimeRow[]
  /** 今の区間の位置（`plan.current`）。 */
  readonly current: number
  readonly rangePending: boolean
  /** 作業中かバックグラウンドで作業中で、広い画面で、ワークプランがあるか。 */
  readonly shown: boolean
}

export function remainingEstimateOf(input: RemainingEstimateInput): RemainingEstimate {
  const { rows, current, rangePending, shown } = input
  const now = rows[current]
  if (!shown || rangePending || now === undefined) {
    return NONE
  }
  const [elapsed] = measuredMinutesOf(now)
  const finished = rows.slice(0, current).flatMap(measuredMinutesOf)
  if (elapsed === undefined || finished.length === 0) {
    return NONE
  }
  const count = rows.length - current
  const passed = Math.floor(elapsed)
  const low = Math.max(1, Math.ceil(count * Math.min(...finished) - passed))
  const high = Math.max(low + 1, Math.ceil(count * Math.max(...finished) - passed))
  return { kind: "shown", low, high }
}

const NONE = { kind: "none" } as const satisfies RemainingEstimate
const MS_PER_MINUTE = 60_000

/** 所要が測れた区間なら分の1要素、測れなければ空。 */
function measuredMinutesOf(row: PhaseTimeRow): readonly number[] {
  const time = row.kind === "phase" ? row.duration : row.wall
  return time.kind === "known" ? [time.milliseconds / MS_PER_MINUTE] : []
}
