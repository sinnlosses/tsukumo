// セッションの切り替え画面を開いているか。
// 帯の札と、迎える口の「前のやり取りを見る」のどちらからも開くので、開閉をここに1つだけ持つ。

import { create } from "zustand"

export type SessionSwitcherRequestState = {
  readonly open: boolean
  readonly openSwitcher: () => void
  readonly closeSwitcher: () => void
}

export const useSessionSwitcherRequest = create<SessionSwitcherRequestState>()((set) => ({
  open: false,
  openSwitcher: () => {
    set({ open: true })
  },
  closeSwitcher: () => {
    set({ open: false })
  },
}))
