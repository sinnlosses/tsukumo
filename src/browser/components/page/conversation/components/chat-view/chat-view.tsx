// 雑談ビューの入口。雑談モードの間だけ、メインビューの場所に出る。
//
// 仕事のときのメインビューとは並びの規則が違うので、部品を分けてある。
// あちらは依頼を境目にやり取りへまとめてタブで遡り、こちらは素直な時系列で積む。
//
// 姿が丸ごと入れ替わったら（`hello`。キャラクターやセッションを切り替えて起こし直したときなど）、作り直して「開いた時点」からやり直す。
// 足止め・弾む行・留めた行はどれも開いた時点に並んでいた記録を基準にするので、残したままだと流し直した過去の記録を新着として1件ずつ出してしまう。

import type { ReactElement } from "react"

import { useSession } from "../../../../../stores/session.ts"
import { useChatView } from "./hooks/use-chat-view.ts"
import { PresentationalChatView } from "./presentational-chat-view.tsx"

export function ChatView(): ReactElement {
  return <ChatViewOfGeneration key={useSession((session) => session.generation)} />
}

function ChatViewOfGeneration(): ReactElement {
  return <PresentationalChatView {...useChatView()} />
}
