// 新しい器「舞台と紙」の部屋の頭の入口。旧い器の帯とサイドバーに代わり、ほかの画面とセッションへ移る。
// 左の群（RoomHead）は舞台の左上、右上の群（RoomHeadTools）は舞台の器の右上に出る。
// 2つは置き場が離れるので、算出を1回にして探すの開閉などの状態を分けないよう、RoomHeadScope が両方を包む。

import { createContext, use, type ReactElement, type ReactNode } from "react"

import { PresentationalRoomHead, PresentationalRoomTools } from "./components/room-head.tsx"
import { useRoomHead, type RoomHeadView } from "./hooks/use-room-head.ts"

type RoomHeadScopeValue =
  | { readonly kind: "outside" }
  | { readonly kind: "inside"; readonly view: RoomHeadView }

const RoomHeadContext = createContext<RoomHeadScopeValue>({ kind: "outside" })

export function RoomHeadScope(props: { readonly children: ReactNode }): ReactElement {
  return (
    <RoomHeadContext value={{ kind: "inside", view: useRoomHead() }}>
      {props.children}
    </RoomHeadContext>
  )
}

export function RoomHead(): ReactElement {
  return <PresentationalRoomHead {...useScopedRoomHead()} />
}

export function RoomHeadTools(): ReactElement {
  return <PresentationalRoomTools {...useScopedRoomHead()} />
}

function useScopedRoomHead(): RoomHeadView {
  const scope = use(RoomHeadContext)
  if (scope.kind === "outside") {
    throw new Error("RoomHead は RoomHeadScope の中に置く")
  }
  return scope.view
}
