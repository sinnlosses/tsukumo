// タスクのモーダルの頭の下の、状態ごとの件数の帯。押すとその状態で絞る。
// 「すべて」のほかは状態の印を添え、印の意味もここで読める。
// ドラフトがあるときは右端に「仕分ける」の口を置き、右の欄をドラフトの分類の場面に替える。

import clsx from "clsx"
import type { ReactElement } from "react"

import { ListChecksIcon } from "../../../components/ui/icon/icon.tsx"
import { SegmentedControl } from "../../../components/ui/segmented-control/segmented-control.tsx"
import type {
  TaskBoardDraftSort,
  TaskBoardFilter,
  TaskBoardFilterChip,
  TaskBoardWorkRepoChip,
} from "../domain/task-board-view.ts"
import { BOARD_SORT_OPEN_DOM_ID, BOARD_SORT_PANE_DOM_ID } from "../domain/task-row-dom-id.ts"
import styles from "./task-board-filter-bar.module.css"
import { TaskState } from "./task-state.tsx"

export function TaskBoardFilterBar(props: {
  readonly chips: readonly TaskBoardFilterChip[]
  readonly workRepos: readonly TaskBoardWorkRepoChip[]
  readonly onWorkRepo: (workRepo?: string) => void
  readonly draftSort: TaskBoardDraftSort
  readonly onFilter: (filter: TaskBoardFilter) => void
}): ReactElement {
  const { draftSort } = props
  return (
    <div className={styles["task-board-filter-row"]}>
      <div className={styles["task-board-filter"]}>
        <SegmentedControl
          label="状態で絞る"
          value={props.chips.find((chip) => chip.pressed)?.filter ?? "all"}
          items={props.chips.map((chip) => ({
            value: chip.filter,
            label: `${chip.label} ${String(chip.count)}`,
            ...(chip.filter === "all"
              ? {}
              : {
                  icon: (
                    <TaskState state={{ kind: chip.filter, text: chip.label }} display="mark" />
                  ),
                }),
          }))}
          onChange={props.onFilter}
        />
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
      {props.workRepos.length > 0 && (
        <div
          role="group"
          aria-label="作業先で絞る"
          className={clsx(styles["task-board-filter"], styles["task-board-work-repos"])}
        >
          <button
            type="button"
            className={styles["task-board-chip"]}
            aria-pressed={props.workRepos.every((chip) => !chip.pressed)}
            onClick={() => props.onWorkRepo(undefined)}
          >
            すべて
          </button>
          {props.workRepos.map((chip) => (
            <button
              key={chip.name}
              type="button"
              className={styles["task-board-chip"]}
              aria-pressed={chip.pressed}
              onClick={() => props.onWorkRepo(chip.name)}
            >
              {chip.name}{" "}
              <span className={styles["task-board-chip-count"]}>{String(chip.count)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
