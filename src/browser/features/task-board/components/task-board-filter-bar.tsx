// タスクのモーダルの頭の下の、状態ごとの件数の帯。押すとその状態で絞る。
// 「すべて」のほかは状態の印を添え、印の意味もここで読める。
// ドラフトがあるときは右端に「仕分ける」の口を置き、右の欄をドラフトの分類の場面に替える（サイドバーの段の見出しの口と同じ顔）。

import type { ReactElement } from "react"

import { ListChecksIcon } from "../../../components/ui/icon/icon.tsx"
import type {
  TaskBoardDraftSort,
  TaskBoardFilter,
  TaskBoardFilterChip,
} from "../domain/task-board-view.ts"
import { BOARD_SORT_OPEN_DOM_ID, BOARD_SORT_PANE_DOM_ID } from "../domain/task-row-dom-id.ts"
import styles from "./task-board-filter-bar.module.css"
import { TaskState } from "./task-state.tsx"

export function TaskBoardFilterBar(props: {
  readonly chips: readonly TaskBoardFilterChip[]
  readonly draftSort: TaskBoardDraftSort
  readonly onFilter: (filter: TaskBoardFilter) => void
}): ReactElement {
  const { draftSort } = props
  return (
    <div className={styles["task-board-filter-row"]}>
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
            {chip.label}{" "}
            <span className={styles["task-board-chip-count"]}>{String(chip.count)}</span>
          </button>
        ))}
      </div>
      {draftSort.kind !== "none" && (
        <button
          type="button"
          id={BOARD_SORT_OPEN_DOM_ID}
          aria-expanded={draftSort.kind === "open"}
          aria-controls={draftSort.kind === "open" ? BOARD_SORT_PANE_DOM_ID : undefined}
          className={styles["task-board-sort-open"]}
          onClick={draftSort.onToggle}
        >
          <ListChecksIcon />
          仕分ける
        </button>
      )}
    </div>
  )
}
