// レポートの「変えたファイル」の節のミニマップを描く差し込み口。
// 地図の部品は別の機能にあり、機能どうしは import できないので、置く側（会話の画面）が描き方を渡す。
// 渡さない場所（レポートの書き出しなど）はミニマップを出さない。

import { createContext, useContext, type ReactNode } from "react"

import type { ChangedFile } from "../../../shared/report/changed-file.ts"
import type { ReportMap } from "../../../shared/report/report-map.ts"

export type RenderMinimap = (props: {
  readonly map: ReportMap
  readonly changed: readonly ChangedFile[]
  readonly selectedId?: string
  readonly onSelect: (boxId: string) => void
}) => ReactNode

const MinimapContext = createContext<RenderMinimap>(() => undefined)

export const MinimapProvider = MinimapContext.Provider

export function useRenderMinimap(): RenderMinimap {
  return useContext(MinimapContext)
}
