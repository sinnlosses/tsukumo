// 雑談のキャラクターのセリフ1件。押すとその時の表情へ立ち絵が遡り、現れたばかりの1件はここで短く弾む。
// 押し方の読み替え（ドラッグとの見分け・キー）は `useSpeechPress` が持つ。
//
// `<button>` ではなく `role="button"` の `<div>`。
// ブラウザは `<button>` の中の文字をドラッグで掴ませず（`user-select` を何にしても選べないことを実機の Chrome で確認した）、セリフをコピーできない。
// 押せることは role と `aria-pressed` で表し、キーの受けだけ自前で足す。

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
