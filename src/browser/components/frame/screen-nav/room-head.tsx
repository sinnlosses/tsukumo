// 「舞台と紙」の部屋の頭の入口。ほかの画面とセッションへ移る。
// 左の群（RoomHead）は舞台の左上、右上の群（RoomHeadTools）は舞台の器の右上、狭い幅の頭（RoomNarrowHead）は縦1列の先頭に出る。
// 置き場が離れるので、算出を1回にして探すの開閉などの状態を分けないよう、RoomHeadScope が全部を包む。
// セッションの一覧と探すのダイアログは、狭い幅で隠れる舞台の中に置くと開いても見えないので、RoomHeadScope が中身の後ろに1回だけ置く。

import { createContext, use, type ReactElement, type ReactNode } from "react"

import {
  PresentationalRoomDialogs,
  PresentationalRoomHead,
  PresentationalRoomNarrowHead,
  PresentationalRoomTools,
  type RoomNarrowHeadSubject,
} from "./components/room-head.tsx"
import { useRoomHead, type RoomHeadView } from "./hooks/use-room-head.ts"

type RoomHeadScopeValue =
  | { readonly kind: "outside" }
  | { readonly kind: "inside"; readonly view: RoomHeadView }

const RoomHeadContext = createContext<RoomHeadScopeValue>({ kind: "outside" })

export function RoomHeadScope(props: { readonly children: ReactNode }): ReactElement {
  const view = useRoomHead()
  return (
    <RoomHeadContext value={{ kind: "inside", view }}>
      {props.children}
      <PresentationalRoomDialogs {...view} />
    </RoomHeadContext>
  )
}

export function RoomHead(): ReactElement {
  return <PresentationalRoomHead {...useScopedRoomHead()} />
}

export function RoomHeadTools(): ReactElement {
  return <PresentationalRoomTools {...useScopedRoomHead()} />
}

export function RoomNarrowHead(props: { readonly subject: RoomNarrowHeadSubject }): ReactElement {
  return <PresentationalRoomNarrowHead {...useScopedRoomHead()} subject={props.subject} />
}

function useScopedRoomHead(): RoomHeadView {
  const scope = use(RoomHeadContext)
  if (scope.kind === "outside") {
    throw new Error("RoomHead は RoomHeadScope の中に置く")
  }
  return scope.view
}
