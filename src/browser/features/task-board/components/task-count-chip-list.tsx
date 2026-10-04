// タスク一覧の見出し下に出す件数のチップ。押すとその状態だけに絞る。
// いつも1枚だけが選ばれていて（既定は「すべて」）、選んでいるチップをもう一度押しても何も変わらない。
// ここは選ばれているかどうかを `aria-pressed` に映すだけ。

import type { ReactElement } from "react"

import type { TaskListCountItem, TaskListFilterStatus } from "../domain/task-list-count.ts"
import styles from "./task-count-chip-list.module.css"

export function TaskCountChipList(props: {
  readonly counts: readonly TaskListCountItem[]
  readonly selected: TaskListFilterStatus
  readonly onSelect: (status: TaskListFilterStatus) => void
}): ReactElement {
  return (
    <ul className={styles["task-count-chips"]} aria-label="絞り込み">
      {props.counts.map((item) => {
        const pressed = props.selected === item.status
        return (
          <li key={item.status} className={styles["task-count-chip"]}>
            <button
              type="button"
              className={styles["task-count-chip-button"]}
              aria-pressed={pressed}
              onClick={() => {
                props.onSelect(item.status)
              }}
            >
              <span>{item.label}</span>{" "}
              <span className={styles["task-count-chip-count"]}>{String(item.count)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
