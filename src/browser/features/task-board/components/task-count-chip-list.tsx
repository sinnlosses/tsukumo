// タスク一覧の見出し下に出す件数のチップ。押すとその状態だけに絞る。
// 1つだけ選べ、選んでいるチップをもう一度押すと全件に戻る。ここは選ばれているかどうかを `aria-pressed` に映すだけ。
//
// 進行中のチップは元から差し色の地なので、色の変化だけでは選択と区別できない。
// 枠線と太字を添える（`task-board.module.css` の `.task-count-chip-button[aria-pressed="true"]`）。

import type { ReactElement } from "react"

import type { TaskListCountItem, TaskListFilterStatus } from "../domain/task-list-count.ts"
import styles from "../task-board.module.css"

export function TaskCountChipList(props: {
  readonly counts: readonly TaskListCountItem[]
  readonly selected: TaskListFilterStatus | undefined
  readonly onSelect: (status: TaskListFilterStatus) => void
}): ReactElement {
  return (
    <ul className={styles["task-count-chips"]}>
      {props.counts.map((item) => {
        const pressed = props.selected === item.status
        return (
          <li
            key={item.status}
            className={
              item.status === "doing"
                ? `${styles["task-count-chip"]} ${styles["task-count-chip-doing"]}`
                : styles["task-count-chip"]
            }
          >
            <button
              type="button"
              className={styles["task-count-chip-button"]}
              aria-pressed={pressed}
              onClick={() => {
                props.onSelect(item.status)
              }}
            >
              {item.label} {String(item.count)}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
