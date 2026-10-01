// 入力欄へフォーカスしてほしいという一回限りの合図（スキップリンクが押す）。
// 持つのは押された回数だけで、回数が増えるたびに入力欄がフォーカスし直す。

import { create } from "zustand"

export type ComposerFocusState = {
  readonly signal: number
  readonly requestFocus: () => void
}

export const useComposerFocus = create<ComposerFocusState>()((set) => ({
  signal: 0,
  requestFocus: () => {
    set((state) => ({ signal: state.signal + 1 }))
  },
}))
