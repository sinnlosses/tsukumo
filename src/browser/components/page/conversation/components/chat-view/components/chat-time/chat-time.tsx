// 発言の脇に添える時刻（`HH:MM`。秒は出さない）。
// 吹き出しの外、下端の内側に置く（キャラクターの行は右脇、利用者の行は左脇）。
//
// 前のセッションを組み直した発言（時刻が `unknown`）には何も出さない。

import type { ReactElement } from "react"

import styles from "../../chat-view.module.css"
import type { ChatTimeStamp } from "../../hooks/use-chat-view.ts"

export function ChatTime(props: { readonly time: ChatTimeStamp }): ReactElement | null {
  if (props.time.kind === "unknown") {
    return null
  }
  return (
    <time className={styles["chat-time"]} dateTime={props.time.dateTime}>
      {props.time.text}
    </time>
  )
}
