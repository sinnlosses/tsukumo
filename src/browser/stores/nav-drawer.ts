// 狭い画面の引き出しを開いているか、どのタブ・どの面を出しているか。
// 引き出しの中に差し込まれた中身（やり取りの行など）からも閉じられるように、開閉はここを通す。
//
// 選んだタブはページを開いているあいだだけ覚え、閉じても戻さない。面（タブか設定か）は閉じるたびにタブへ戻す。

import { create } from "zustand"

export type NavDrawerTab = "turns" | "tasks" | "usage"

export type NavDrawerFace = "tabs" | "settings"

export type NavDrawerState = {
  readonly open: boolean
  readonly tab: NavDrawerTab
  readonly face: NavDrawerFace
  readonly openDrawer: () => void
  readonly close: () => void
  readonly selectTab: (tab: NavDrawerTab) => void
  readonly showSettings: () => void
  readonly showTabs: () => void
}

export const useNavDrawer = create<NavDrawerState>()((set) => ({
  open: false,
  tab: "turns",
  face: "tabs",
  openDrawer: () => {
    set({ open: true, face: "tabs" })
  },
  close: () => {
    set({ open: false, face: "tabs" })
  },
  selectTab: (tab) => {
    set({ tab })
  },
  showSettings: () => {
    set({ face: "settings" })
  },
  showTabs: () => {
    set({ face: "tabs" })
  },
}))
