// 地図で選んだ箱と、広げたかどうか。サイドバーの地図のタブと会話の画面の広げた地図が読む。保存しない。
// 選んだ箱は、選んだときの図と一緒に持つ（つながりの本数と親の箱を、その図から引くため）。

import { create } from "zustand"

import type { MapView, MapViewBox } from "../../../shared/architecture-map/map-view.ts"
import type { MapBoxBadgeValue } from "./map-box-mention.ts"

type SelectedBox = {
  readonly box: MapViewBox
  /** 箱を選んだ図。 */
  readonly view: MapView
  /** ミニマップなどの画面の操作か、会話で指されたか。 */
  readonly by: "screen" | "conversation"
}

type ArchitectureMapSelectionState = {
  readonly selected?: SelectedBox
  readonly expanded: boolean
  /** 入力欄の頭に付けた箱のバッジ。送ると外れる。 */
  readonly badge?: MapBoxBadgeValue
  readonly attachBadge: (box: MapViewBox) => void
  readonly detachBadge: () => void
  /** 箱を選ぶ口。会話で箱を指す側もここから選ぶ。 */
  readonly selectBox: (selected: SelectedBox) => void
  readonly expand: () => void
  readonly collapse: () => void
}

export const useArchitectureMapSelection = create<ArchitectureMapSelectionState>()((set) => ({
  expanded: false,
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
  expand: () => {
    set({ expanded: true })
  },
  collapse: () => {
    set({ expanded: false })
  },
}))
