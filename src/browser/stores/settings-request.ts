// 設定のモーダルを開いているか。帯の歯車とショートカット（⌘,）のどちらからも開くので、開閉をここに1つだけ持つ。

import { create } from "zustand"

type SettingsRequestState = {
  readonly open: boolean
  readonly openSettings: () => void
  readonly closeSettings: () => void
}

export const useSettingsRequest = create<SettingsRequestState>()((set) => ({
  open: false,
  openSettings: () => {
    set({ open: true })
  },
  closeSettings: () => {
    set({ open: false })
  },
}))
