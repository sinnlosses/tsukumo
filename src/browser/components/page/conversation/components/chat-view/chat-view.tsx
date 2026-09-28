// 雑談ビューの入口。雑談モードの間だけ、メインビューの場所に出る。
//
// 仕事のときのメインビューとは並びの規則が違うので、部品を分けてある。
// あちらは依頼を境目にやり取りへまとめてタブで遡り、こちらは素直な時系列で積む。

import type { ReactElement } from "react"

import { useChatView } from "./hooks/use-chat-view.ts"
import { PresentationalChatView } from "./presentational-chat-view.tsx"

export function ChatView(): ReactElement {
  return <PresentationalChatView {...useChatView()} />
}
