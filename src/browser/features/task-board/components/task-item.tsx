// 区画の一覧1件分。バッジ（status）を先頭列、ID＋summary を2列目に置く2列の grid 行
// （`.task-item` の `grid-template-columns: auto 1fr`。`task-board.module.css`）。

import { type ReactElement } from "react"

import { type TaskSummaryItem } from "../../../../shared/task-summary.ts"
import styles from "../task-board.module.css"
import { TaskStatusBadge } from "./task-status-badge.tsx"

export function TaskItem(props: { readonly task: TaskSummaryItem }): ReactElement {
  const doneClass = props.task.status === "done" ? ` ${styles["task-done"]}` : ""

  return (
    <li className={`${styles["task-item"]}${doneClass}`}>
      <span>
        {props.task.status === undefined ? null : <TaskStatusBadge status={props.task.status} />}
      </span>
      <span>
        <span className={styles["task-id"]}>{props.task.id}</span> {props.task.summary}
      </span>
    </li>
  )
}
