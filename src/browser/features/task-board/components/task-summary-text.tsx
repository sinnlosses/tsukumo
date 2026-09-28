// タスクの要約（一覧の行・詳細のタイトル・依存の札）。バッククォートで囲まれた部分を等幅で出す。

import { Fragment, type ReactElement } from "react"

import type { SummaryPart } from "../hooks/use-task-board.ts"
import styles from "../task-board.module.css"

export function TaskSummaryText(props: { readonly parts: readonly SummaryPart[] }): ReactElement {
  return (
    <>
      {props.parts.map((part, index) =>
        part.kind === "code" ? (
          <code key={`${String(index)}-${part.text}`} className={styles["task-summary-code"]}>
            {part.text}
          </code>
        ) : (
          <Fragment key={`${String(index)}-${part.text}`}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}
