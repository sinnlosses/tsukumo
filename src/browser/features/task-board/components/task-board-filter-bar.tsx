// タスクのモーダルの頭の下の、状態ごとの件数の帯。押すとその状態で絞る。
// 「すべて」のほかは状態の印を添え、印の意味もここで読める。

import type { ReactElement } from "react"

import type { TaskBoardFilter, TaskBoardFilterChip } from "../domain/task-board-view.ts"
import styles from "./task-board-filter-bar.module.css"
import { TaskState } from "./task-state.tsx"

export function TaskBoardFilterBar(props: {
  readonly chips: readonly TaskBoardFilterChip[]
  readonly onFilter: (filter: TaskBoardFilter) => void
}): ReactElement {
  return (
    <div role="group" aria-label="状態で絞る" className={styles["task-board-filter"]}>
      {props.chips.map((chip) => (
        <button
          key={chip.filter}
          type="button"
          className={styles["task-board-chip"]}
          aria-pressed={chip.pressed}
          onClick={() => props.onFilter(chip.filter)}
        >
          {chip.filter !== "all" && (
            <TaskState state={{ kind: chip.filter, text: chip.label }} display="mark" />
          )}
          {chip.label} <span className={styles["task-board-chip-count"]}>{String(chip.count)}</span>
        </button>
      ))}
    </div>
  )
}
