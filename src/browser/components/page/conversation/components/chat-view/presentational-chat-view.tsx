// 雑談ビューの器。中央の列に会話のログを置く。立ち絵は左の列（`ChatStage`）が持つ。
//
// 狭い画面（760px 以下）では左の列を出さないので、ログの下に顔だけの行を出す（どちらを出すかは CSS の `@media`）。

import type { ReactElement } from "react"

import { CharacterFace } from "../../../../frame/character-face.tsx"
import { ChatLog } from "./chat-log.tsx"
import styles from "./chat-view.module.css"
import type { ChatViewModel } from "./hooks/use-chat-view.ts"

export type PresentationalChatViewProps = Pick<
  ChatViewModel,
  "logRef" | "rows" | "showTyping" | "showEmptyMessage" | "face"
>

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.logRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 */
export function PresentationalChatView({
  logRef,
  rows,
  showTyping,
  showEmptyMessage,
  face,
}: PresentationalChatViewProps): ReactElement {
  return (
    <div className={styles["chat-view"]}>
      <ChatLog
        logRef={logRef}
        rows={rows}
        showTyping={showTyping}
        showEmptyMessage={showEmptyMessage}
      />
      <div className={styles["chat-face-row"]}>
        <CharacterFace url={face.url} alt={face.alt} className={styles["chat-face"]} />
      </div>
    </div>
  )
}
