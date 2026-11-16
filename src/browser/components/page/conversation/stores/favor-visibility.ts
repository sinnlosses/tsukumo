// 最新のやり取りの最終レポートにあるお願いの欄が、ビューポートに見えているか。
// 欄の側が書き、入力欄の上の帯が読む（置き場が離れているので store を挟む）。
// favorId は観測中の欄の id で、欄が無い（過去のやり取りを見ているときを含む）あいだは undefined。

import { create } from "zustand"

type FavorVisibilityState = {
  readonly favorId?: string
  readonly visible: boolean
  readonly dismissedId?: string
  readonly attach: (favorId: string) => void
  readonly detach: () => void
  readonly setVisible: (visible: boolean) => void
  readonly dismiss: () => void
}

export const useFavorVisibility = create<FavorVisibilityState>()((set) => ({
  visible: false,
  attach: (favorId) => {
    set({ favorId, visible: false })
  },
  detach: () => {
    set({ favorId: undefined, visible: false })
  },
  setVisible: (visible) => {
    set({ visible })
  },
  dismiss: () => {
    set((state) => ({ dismissedId: state.favorId }))
  },
}))

/** お願いが待っているのは、お願いがあり、依頼を送って外したものでないとき（見えているかは問わない）。 */
export function favorWaiting(
  state: Pick<FavorVisibilityState, "favorId" | "dismissedId">,
): boolean {
  return state.favorId !== undefined && state.dismissedId !== state.favorId
}

/** 帯を出すのは、お願いがあり・見えておらず・依頼を送って外したものでないときだけ。 */
export function favorBandShown(
  state: Pick<FavorVisibilityState, "favorId" | "visible" | "dismissedId">,
): boolean {
  return state.favorId !== undefined && !state.visible && state.dismissedId !== state.favorId
}
