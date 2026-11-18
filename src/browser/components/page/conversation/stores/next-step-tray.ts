// 入力欄の頭に並べる次の一手。
// 最新のやり取りの最終レポートの側が書き、入力欄の側が読む（置き場が離れているので store を挟む）。
// reportKey は並びの元の最終レポートの鍵で、元が無い（過去のやり取りを見ているときを含む）あいだは undefined。

import { create } from "zustand"

import type { NextStep } from "../../../../features/report/next-step.ts"

type NextStepTrayState = {
  readonly reportKey?: string
  readonly steps: readonly NextStep[]
  /** 依頼を送って外した並びの元の鍵。 */
  readonly dismissedKey?: string
  /** 畳んだ並びの元の鍵。次の最終レポートが付くと鍵が替わって開く（タブのメモリだけに持つ）。 */
  readonly foldedKey?: string
  readonly attach: (reportKey: string, steps: readonly NextStep[]) => void
  /** 今の元が `reportKey` のときだけ外す（次の元が先に付いていれば、それを残す）。 */
  readonly detach: (reportKey: string) => void
  readonly dismiss: () => void
  readonly fold: () => void
  readonly unfold: () => void
}

export const useNextStepTray = create<NextStepTrayState>()((set) => ({
  steps: [],
  fold: () => {
    set((state) => ({ foldedKey: state.reportKey }))
  },
  unfold: () => {
    set({ foldedKey: undefined })
  },
  attach: (reportKey, steps) => {
    set({ reportKey, steps })
  },
  detach: (reportKey) => {
    set((state) => (state.reportKey === reportKey ? { reportKey: undefined, steps: [] } : {}))
  },
  dismiss: () => {
    set((state) => ({ dismissedKey: state.reportKey }))
  },
}))

/** 並びを出すのは、元があり・札が1つ以上あり・依頼を送って外したものでないときだけ。 */
export function nextStepTrayShown(
  state: Pick<NextStepTrayState, "reportKey" | "steps" | "dismissedKey">,
): boolean {
  return (
    state.reportKey !== undefined &&
    state.steps.length > 0 &&
    state.dismissedKey !== state.reportKey
  )
}

/** 今の元の並びを畳んでいるか。 */
export function nextStepTrayFolded(
  state: Pick<NextStepTrayState, "reportKey" | "foldedKey">,
): boolean {
  return state.reportKey !== undefined && state.foldedKey === state.reportKey
}

/** 並びの元の最終レポートの鍵。やり取りの番号とステップの `id` から組む。 */
export function nextStepReportKey(turnId: number, stepId: number): string {
  return `${String(turnId)}:${String(stepId)}`
}
