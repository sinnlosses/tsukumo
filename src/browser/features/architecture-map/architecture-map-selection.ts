// 地図で選んだ箱と、広げたかどうか。サイドバーの地図のタブと会話の画面の広げた地図が読む。保存しない。
// 選んだ箱は、選んだときの図と一緒に持つ（つながりの本数と親の箱を、その図から引くため）。

import { create } from "zustand"

import type { MapView, MapViewBox } from "../../../shared/architecture-map/map-view.ts"
import type { MapBoxBadgeValue } from "./map-box-mention.ts"

export type SelectedBox = {
  readonly box: MapViewBox
  /** 箱を選んだ図。 */
  readonly view: MapView
  /** ミニマップなどの画面の操作か、会話で指されたか。 */
  readonly by: "screen" | "conversation"
}

type SidebarTab = "tasks" | "map"

type ArchitectureMapSelectionState = {
  readonly selected?: SelectedBox
  /** 本文・セリフのバッジに触れている箱の ID。地図の図が光らせる。 */
  readonly lit?: string
  /** 光らせる箱がある図（中・小の箱は親の図）。引けるまでは無い。 */
  readonly litView?: MapView
  readonly expanded: boolean
  readonly sidebarTab: SidebarTab
  /** 地図のタブを開いていないあいだに、会話から指された回数。 */
  readonly unseenPointCount: number
  readonly setLit: (id: string) => void
  /** 触れている箱の図を置く。もう離れていたら置かない。 */
  readonly setLitView: (id: string, view: MapView) => void
  readonly clearLit: () => void
  readonly chooseSidebarTab: (tab: SidebarTab) => void
  /** 会話で箱を指す。選ぶだけで、タブは切り替えない（地図のタブを開いていなければ見ていない回数を足す）。 */
  readonly pointBox: (box: MapViewBox, view: MapView) => void
  /** 入力欄の頭に付けた箱のバッジ。送ると外れる。 */
  readonly badge?: MapBoxBadgeValue
  readonly attachBadge: (box: MapViewBox) => void
  readonly detachBadge: () => void
  /** 箱を選ぶ口。会話で箱を指す側もここから選ぶ。 */
  readonly selectBox: (selected: SelectedBox) => void
  /** 選びを外す。サイドバーの地図は全体の図とリポジトリの説明に戻る。 */
  readonly clearSelection: () => void
  readonly expand: () => void
  readonly collapse: () => void
}

export const useArchitectureMapSelection = create<ArchitectureMapSelectionState>()((set) => ({
  expanded: false,
  sidebarTab: "tasks",
  unseenPointCount: 0,
  setLit: (lit) => {
    set({ lit, litView: undefined })
  },
  setLitView: (id, litView) => {
    set((state) => (state.lit === id ? { litView } : {}))
  },
  clearLit: () => {
    set({ lit: undefined, litView: undefined })
  },
  chooseSidebarTab: (sidebarTab) => {
    set(sidebarTab === "map" ? { sidebarTab, unseenPointCount: 0 } : { sidebarTab })
  },
  pointBox: (box, view) => {
    set((state) => ({
      selected: { box, view, by: "conversation" },
      unseenPointCount:
        state.sidebarTab === "map" ? state.unseenPointCount : state.unseenPointCount + 1,
    }))
  },
  attachBadge: (box) => {
    set({
      badge: {
        id: box.id,
        title: box.title,
        level: box.level,
        ...(box.summary === undefined ? {} : { summary: box.summary }),
      },
    })
  },
  detachBadge: () => {
    set({ badge: undefined })
  },
  selectBox: (selected) => {
    set({ selected })
  },
  clearSelection: () => {
    set({ selected: undefined })
  },
  expand: () => {
    set({ expanded: true })
  },
  collapse: () => {
    set({ expanded: false })
  },
}))
