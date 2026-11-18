// 会話の画面の仕切りを既定の幅へ戻してほしいという一回限りの合図（コマンドパレットが押す）。
// 持つのは押された回数だけで、会話の画面の器は開いたあとに増えた回数でだけ戻す。

import { create } from "zustand"

type LayoutSplitResetState = {
  readonly signal: number
  readonly requestReset: () => void
}

export const useLayoutSplitReset = create<LayoutSplitResetState>()((set) => ({
  signal: 0,
  requestReset: () => {
    set((state) => ({ signal: state.signal + 1 }))
  },
}))
