// 本文の `{{map: <ID>}}` の印を描く差し込み口。
// 地図の部品は別の機能にあり、機能どうしは import できないので、置く側（会話の画面）が描き方を渡す。
// 渡さない場所（レポートの書き出しなど）は印の元の字のまま描く。

import { createContext, useContext, type ReactNode } from "react"

type RenderMapMark = (id: string, source: string) => ReactNode

const MapMarkContext = createContext<RenderMapMark>((_id, source) => source)

export const MapMarkProvider = MapMarkContext.Provider

export function useRenderMapMark(): RenderMapMark {
  return useContext(MapMarkContext)
}
