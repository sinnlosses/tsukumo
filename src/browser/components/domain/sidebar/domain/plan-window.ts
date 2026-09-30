// 利用枠の語彙。取れた状態（`PlanUsageState`）から描く2つの枠（`WindowDisplay`）を起こし、警告にするかを決める。

import type { PlanUsage } from "../../../../../shared/plan-usage/plan-usage.ts"

/** 高いときの境目（%）。見本（`QUOTA-Sidebar.dc.html`「2 高いとき」）の値。 */
const WARN_THRESHOLD_PERCENTAGE = 80

/**
 * 描くために要る形。`pending` はまだ一度も取れていないときだけの骨組み用（`fetching` は常に `true`）。
 * `unavailable` の `takenAt` は「最後に失敗した時刻」で、まだ一度も応答が届いていなければ `undefined`。
 */
export type PlanUsageState =
  | { readonly kind: "pending" }
  | { readonly kind: "ready"; readonly usage: PlanUsage; readonly takenAt: number }
  | { readonly kind: "unavailable"; readonly takenAt: number | undefined }
  | { readonly kind: "not-applicable" }

export type WindowDisplay = {
  readonly utilization: number | undefined
  readonly resetsAt: number | undefined
}

/** 描く2つの枠。取れない・該当しないときは `undefined`（一言に置き換える）。 */
export function windowsOf(
  state: PlanUsageState,
): { readonly fiveHour: WindowDisplay; readonly sevenDay: WindowDisplay } | undefined {
  if (state.kind === "ready") {
    return state.usage
  }
  if (state.kind === "pending") {
    const empty: WindowDisplay = { utilization: undefined, resetsAt: undefined }
    return { fiveHour: empty, sevenDay: empty }
  }
  return undefined
}

/** 警告の色にするか。取れていないときは警告にしない。 */
export function isPlanWindowWarn(window: WindowDisplay): boolean {
  return window.utilization !== undefined && window.utilization >= WARN_THRESHOLD_PERCENTAGE
}
