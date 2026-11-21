// 草稿として描いた `report` の呼び出しの ID。確定版に書き上げる演出を掛けないかを決める材料。
// やり取りの部品は、やり取りを選び直すと作り直されるので、部品の state には持たない。

import { create } from "zustand"

type DraftedReportState = {
  readonly toolUseIds: ReadonlySet<string>
  readonly remember: (toolUseIds: readonly string[]) => void
}

export const useDraftedReports = create<DraftedReportState>()((set) => ({
  toolUseIds: new Set(),
  remember: (toolUseIds) => {
    set((state) =>
      toolUseIds.every((id) => state.toolUseIds.has(id))
        ? state
        : { toolUseIds: new Set([...state.toolUseIds, ...toolUseIds]) },
    )
  },
}))
