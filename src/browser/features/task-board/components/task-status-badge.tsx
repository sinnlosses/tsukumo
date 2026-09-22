// status のバッジ（区画の一覧で、行の先頭に置く印）。表のほうは同じ色を素の文字に載せるので
// バッジにはしない（`task-row.tsx`）。

import { type ReactElement } from "react"

import { taskStatusClass } from "../domain/task-status.ts"
import styles from "../task-board.module.css"

export function TaskStatusBadge(props: { readonly status: string }): ReactElement {
  return (
    <span className={`${styles["task-status"]} ${taskStatusClass(props.status)}`}>
      {props.status}
    </span>
  )
}
