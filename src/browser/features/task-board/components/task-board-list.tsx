// タスクのモーダルの左の一覧（`role="listbox"`）。行は1段目に ID・状態・ループの印・難易度、2段目に要約。
// 行を押すと選ぶだけで、頼まない（頼むのは操作の帯の「tsukumo に頼む」）。

import { Repeat } from "lucide-react"
import type { ReactElement } from "react"

import { Text } from "../../../components/ui/text/text.tsx"
import type { TaskBoardRow } from "../hooks/use-task-board.ts"
import styles from "../task-board.module.css"
import { TaskDifficulty } from "./task-difficulty.tsx"
import { TaskState } from "./task-state.tsx"
import { TaskSummaryText } from "./task-summary-text.tsx"

export function TaskBoardList(props: {
  readonly listId: string
  readonly rows: readonly TaskBoardRow[]
  readonly onSelect: (id: string) => void
}): ReactElement {
  return (
    <div className={styles["task-board-list-scroll"]}>
      <ul
        id={props.listId}
        role="listbox"
        aria-label="タスク"
        className={styles["task-board-list"]}
      >
        {props.rows.map((row) => (
          <TaskBoardOption key={row.id} row={row} onSelect={props.onSelect} />
        ))}
      </ul>
      {props.rows.length === 0 && (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["task-board-message"]}
        >
          当てはまるタスクが無い
        </Text>
      )}
    </div>
  )
}

function TaskBoardOption(props: {
  readonly row: TaskBoardRow
  readonly onSelect: (id: string) => void
}): ReactElement {
  const row = props.row
  return (
    <li
      id={row.optionId}
      role="option"
      aria-selected={row.selected}
      data-state={row.state.kind}
      ref={row.selected ? scrollIntoNearest : undefined}
      className={styles["task-board-option"]}
      onClick={() => props.onSelect(row.id)}
    >
      {row.outOfFilter && (
        <span className={styles["task-board-option-out-of-filter"]}>絞り込みの外</span>
      )}
      <span className={styles["task-board-option-head"]}>
        <span className={styles["task-board-option-id"]}>{row.id}</span>
        <TaskState state={row.state} />
        {row.loopable && (
          <span className={styles["task-board-loop"]} role="img" aria-label="ループで回せる">
            <Repeat size={12} strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <TaskDifficulty difficulty={row.difficulty} />
      </span>
      <span className={styles["task-board-option-summary"]}>
        <TaskSummaryText parts={row.summary} />
      </span>
    </li>
  )
}

/**
 * 選んだ行を一覧の内側で見える位置まで送る（↑↓ で画面の外の行へ移ったとき）。
 * 選ばれた行に付けたときだけ呼ばれるよう、モジュールの関数にして参照を変えない。
 */
function scrollIntoNearest(element: HTMLLIElement | null): void {
  element?.scrollIntoView({ block: "nearest" })
}
