// 会話の画面（hash が空のときの既定の画面）の**入口**。いま雑談モードかをストアから読んで器に渡すだけで、
// 4領域の差し込みは `presentational-conversation.tsx` が持つ（docs/design.md 2章「ページの形」と
// 「領域の機能と、置かれる機能」）。ストアを読むだけなので `hooks/use-conversation.ts` は作らない。

import { type ReactElement } from "react"

import { useSessionSelector } from "../../../stores/session.tsx"
import { PresentationalConversation } from "./presentational-conversation.tsx"

export function Conversation(): ReactElement {
  return (
    <PresentationalConversation
      chatMode={useSessionSelector((session) => session.state.chatMode)}
    />
  )
}
