// 日の区切り（docs/design.md 13.7「時刻と日の区切り」）。**その下に続く発言の日**を出す
// （文字は `hooks/use-chat-view.ts` が `9月23日（水）` の形に組む）。
//
// 押せない・畳めない。文字は `ink-quiet`（読む面の原則。13.1 原則1）で、区切りは色を持たない。

import { type ReactElement } from "react"

import styles from "../chat-view.module.css"

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
