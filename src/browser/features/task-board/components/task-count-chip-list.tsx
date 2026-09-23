// タスク一覧の見出し下に出す件数のチップ。**押せない**（絞り込みは見出しの「一覧を見る」から
// 開く表の仕事。`domain/task-list-count.ts`）。

import { type ReactElement } from "react"

import { type TaskListCountItem } from "../domain/task-list-count.ts"
import styles from "../task-board.module.css"

export function TaskCountChipList(props: {
  readonly counts: readonly TaskListCountItem[]
}): ReactElement {
  return (
    <ul className={styles["task-count-chips"]}>
      {props.counts.map((item) => (
        <li key={item.label} className={styles["task-count-chip"]}>
          {item.label} {String(item.count)}
        </li>
      ))}
    </ul>
  )
}
