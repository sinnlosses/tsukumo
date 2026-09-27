// キャラクターのセリフ1件（docs/screen-design.md 13.7）。押すとその時の表情へ立ち絵が遡り、
// 現れたばかりの1件はここで短く弾む。押し方の読み替え（ドラッグとの見分け・キー）は
// `components/hooks/use-speech-press.ts`（仕事モードの吹き出し・セリフのログと共有）が持つ。
//
// `<button>` ではなく `role="button"` の `<div>`。ブラウザは `<button>` の中の文字を
// ドラッグで掴ませず（`user-select` を何にしても選べないことを実機の Chrome で確認した）、
// セリフをコピーできなかった。押せることは role と `aria-pressed` で表し、キーの受けだけ
// 自前で足す。

import clsx from "clsx"
import type { ReactElement } from "react"

import { useSpeechPress } from "../../../hooks/use-speech-press.ts"
import styles from "../../chat-view.module.css"

export function ChatSpeech(props: {
  readonly text: string
  readonly selected: boolean
  readonly pop: boolean
  readonly onToggle: () => void
}): ReactElement {
  const speech = useSpeechPress(props.onToggle)

  return (
    <div
      className={clsx(
        styles["chat-entry"],
        styles["chat-entry-character"],
        props.selected && styles["is-selected"],
        props.pop && styles["chat-entry-pop"],
      )}
      data-speaker="character"
      role="button"
      tabIndex={0}
      aria-pressed={props.selected}
      onMouseDown={speech.onMouseDown}
      onClick={speech.onClick}
      onKeyDown={speech.onKeyDown}
    >
      {props.text}
    </div>
  )
}
