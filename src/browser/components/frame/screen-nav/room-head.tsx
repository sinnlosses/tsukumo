// 新しい器「舞台と紙」の部屋の頭の入口。旧い器の帯とサイドバーに代わり、舞台の左上からほかの画面とセッションへ移る。

import type { ReactElement } from "react"

import { PresentationalRoomHead } from "./components/room-head.tsx"
import { useRoomHead } from "./hooks/use-room-head.ts"

export function RoomHead(): ReactElement {
  return <PresentationalRoomHead {...useRoomHead()} />
}
