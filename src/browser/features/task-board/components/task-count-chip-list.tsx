// タスク一覧の見出し下に出す件数のチップ。**押すとその状態だけに絞る**（1つだけ選べ、選んで
// いるチップをもう一度押すと全件に戻る。経緯は docs/requirements.md 4.2。絞り込みそのものは
// `domain/task-sidebar-filter.ts` の純関数で、ここは選ばれているかどうかを `aria-pressed` に
// 映すだけ）。
//
// **選んでいることを色だけで示さない**（docs/design.md 13.1 原則1）: 進行中のチップは元から
// 差し色の地なので、色の変化だけでは選択と区別できない。枠線と太字を添える
// （`task-board.module.css` の `.task-count-chip-button[aria-pressed="true"]`）。

import { type ReactElement } from "react"

import { type TaskListCountItem, type TaskListFilterStatus } from "../domain/task-list-count.ts"
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
