// セッションの切り替え画面を開いているか。
// 帯の札と、迎える口の「前のやり取りを見る」のどちらからも開くので、開閉をここに1つだけ持つ。

import { create } from "zustand"

export type SessionSwitcherRequestState = {
  readonly open: boolean
  /** 開いた時刻（エポックミリ秒）。一覧の「今日」「昨日」の分け方の基準で、開いているあいだだけ意味を持つ。 */
  readonly openedAt: number
  readonly openSwitcher: (at: number) => void
  readonly closeSwitcher: () => void
}

export const useSessionSwitcherRequest = create<SessionSwitcherRequestState>()((set) => ({
  open: false,
  openedAt: 0,
  openSwitcher: (at) => {
    set({ open: true, openedAt: at })
  },
  closeSwitcher: () => {
    set({ open: false })
  },
}))
