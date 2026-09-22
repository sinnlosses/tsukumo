// キャラクターのセリフ1件（docs/design.md 13.7）。**押すとその時の表情へ立ち絵が遡り**、
// **届いたばかりの1件はここで育つ**。押し方の読み替え（ドラッグとの見分け・キー・育っている
// 最中の打ち切り）は `hooks/use-chat-speech.ts` が持つ。
//
// **`<button>` ではなく `role="button"` の `<div>`**。ブラウザは `<button>` の中の文字を
// ドラッグで掴ませず（`user-select` を何にしても選べないことを実機の Chrome で確認した）、
// **セリフをコピーできなかった**。押せることは role と `aria-pressed` で表し、キーの受けだけ
// 自前で足す。
//
// 行ごとに育ち具合を持つので、フックはこの部品が呼ぶ（ログ全体の側へは上げられない）。

import { type ReactElement } from "react"

import styles from "../chat-view.module.css"
import { useChatSpeech } from "../hooks/use-chat-speech.ts"

export function ChatSpeech(props: {
  readonly text: string
  readonly selected: boolean
  readonly grow: boolean
  readonly onToggle: () => void
}): ReactElement {
  const speech = useChatSpeech(props.text, props.grow, props.onToggle)

  return (
    <div
      className={`${styles["chat-entry"]} ${styles["chat-entry-character"]}${
        props.selected ? ` ${styles["is-selected"]}` : ""
      }`}
      data-speaker="character"
      // 育っている間だけ立てる印（筆先を出す CSS の掛かり先と、目視・テストの手がかり）。
      data-growing={speech.growing ? "yes" : undefined}
      role="button"
      tabIndex={0}
      aria-pressed={props.selected}
      onMouseDown={speech.onMouseDown}
      onClick={speech.onClick}
      onKeyDown={speech.onKeyDown}
    >
      {speech.shown}
    </div>
  )
}
