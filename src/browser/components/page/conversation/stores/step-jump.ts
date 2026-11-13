// 紙（メインビュー）の段まで連れていってほしいという一回限りの合図。
// 合図は受け手（そのターンの `<Turn>`）が1回だけ受け取って下ろす。ターンを切り替えてから受け手が付いても、下ろされるまで残る。

import { create } from "zustand"

/** 連れていく先の段。`stepId` は紙のステップ（`MainViewStep.id`）、`turnId` はそのステップのあるターン。 */
export type StepJumpTarget = { readonly turnId: number; readonly stepId: number }

type StepJump = { readonly kind: "none" } | ({ readonly kind: "pending" } & StepJumpTarget)

export type StepJumpState = {
  readonly jump: StepJump
  readonly requestJump: (target: StepJumpTarget) => void
  /** 受け手が合図を受け取ったら呼ぶ。 */
  readonly settleJump: () => void
}

export const useStepJump = create<StepJumpState>()((set) => ({
  jump: { kind: "none" },
  requestJump: (target) => {
    set({ jump: { kind: "pending", ...target } })
  },
  settleJump: () => {
    set({ jump: { kind: "none" } })
  },
}))
