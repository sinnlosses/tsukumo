// 雑談ビューの入口。雑談モードの間だけ出る。
//
// 立ち絵（左の列。`ChatStage`）と会話のログ（中央の列。`ChatView`）は置き場所が違うので、表情などの state は `ChatViewProvider` が1つだけ持ち、両方が読む。
// 仕事のときのメインビューとは並びの規則が違うので、部品を分けてある。
// あちらは依頼を境目にやり取りへまとめてタブで遡り、こちらは素直な時系列で積む。
//
// 姿が丸ごと入れ替わったら（`hello`。キャラクターやセッションを切り替えて起こし直したときなど）、雑談の state（ログ・表情・留めた行）だけ作り直して「開いた時点」からやり直す。
// 足止め・弾む行・留めた行はどれも開いた時点に並んでいた記録を基準にするので、残したままだと流し直した過去の記録を新着として1件ずつ出してしまう。

import type { ReactElement, ReactNode } from "react"

import { ChatViewContext, useChatViewModel } from "./hooks/use-chat-view-model.ts"
import { useChatView } from "./hooks/use-chat-view.ts"
import { PresentationalChatView } from "./presentational-chat-view.tsx"

export { ChatStage } from "./chat-stage.tsx"

/** 中央の列に出す雑談のログ。`ChatViewProvider` の中に置く。 */
export function ChatView(): ReactElement {
  const { logRef, rows, showTyping, showEmptyMessage, face } = useChatViewModel()
  return (
    <PresentationalChatView
      logRef={logRef}
      rows={rows}
      showTyping={showTyping}
      showEmptyMessage={showEmptyMessage}
      face={face}
    />
  )
}

/**
 * 雑談の state を持ち、束を同じ描画の中で配る。
 * 姿の世代が替わると雑談の state だけが描画中に開いた時点へ戻り、子（レイアウトと、その手元の state）は作り直さない。
 */
export function ChatViewProvider(props: {
  readonly active?: boolean
  readonly children: ReactNode
}): ReactElement {
  const model = useChatView(props.active ?? true)
  return <ChatViewContext value={{ kind: "ready", ...model }}>{props.children}</ChatViewContext>
}
