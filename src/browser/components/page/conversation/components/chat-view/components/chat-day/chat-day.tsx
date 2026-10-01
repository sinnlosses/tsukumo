// 日の区切り。その下に続く発言の日を出す。押せない・畳めない。

import type { ReactElement } from "react"

import styles from "./chat-day.module.css"

export function ChatDay(props: {
  readonly dateTime: string
  readonly label: string
}): ReactElement {
  return (
    <div className={styles["chat-day"]} data-day={props.dateTime}>
      <time dateTime={props.dateTime}>{props.label}</time>
    </div>
  )
}
