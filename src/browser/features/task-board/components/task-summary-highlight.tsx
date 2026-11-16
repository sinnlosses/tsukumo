// 探している語に当たった範囲を強調した題。コードの片は `TaskSummaryText` と同じ等幅で出す。

import type { ReactElement } from "react"

import type { MatchedPart } from "../domain/task-search.ts"
import summaryStyles from "../task-summary-text.module.css"
import styles from "./task-summary-highlight.module.css"

export function TaskSummaryHighlight(props: {
  readonly parts: readonly MatchedPart[]
}): ReactElement {
  return (
    <>
      {props.parts.map((part, index) => {
        const text = part.matched ? (
          <mark className={styles["task-summary-mark"]}>{part.text}</mark>
        ) : (
          part.text
        )
        return part.kind === "code" ? (
          <code
            key={`${String(index)}-${part.text}`}
            className={summaryStyles["task-summary-code"]}
          >
            {text}
          </code>
        ) : (
          <span key={`${String(index)}-${part.text}`}>{text}</span>
        )
      })}
    </>
  )
}
