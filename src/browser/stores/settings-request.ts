// 設定のモーダルを開いているか。開閉はここに1つだけ持つ。

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
