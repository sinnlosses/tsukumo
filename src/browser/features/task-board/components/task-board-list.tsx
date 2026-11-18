// タスクのモーダルの一覧（`role="listbox"`）。1行1件の表で、列は番号・題・難しさ・ループ可。
// 行は状態の段（`role="group"`）に分けて置き、列の見出しの行は読み上げない（行の名前が列の順に読める）。
// 列は CSS の grid と `subgrid` でそろえる（`<table>` にすると listbox の型で読めない）。
// 行を押すと選ぶだけで、頼まない（頼むのは操作の帯の頼む口）。

import type { ReactElement } from "react"

import { Text } from "../../../components/ui/text/text.tsx"
import { VisuallyHidden } from "../../../components/ui/visually-hidden/visually-hidden.tsx"
import type { TaskBoardRow, TaskBoardStage } from "../domain/task-board-view.ts"
import taskBoardStyles from "../task-board.module.css"
import { TaskSummaryText } from "../task-summary-text.tsx"
import { TaskDifficultyScale, TaskLoopMark } from "./task-attribute.tsx"
import styles from "./task-board-list.module.css"
import { TaskState } from "./task-state.tsx"

export function TaskBoardList(props: {
  readonly listId: string
  readonly stages: readonly TaskBoardStage[]
  readonly omittedClosedCount: number
  readonly onSelect: (id: string) => void
}): ReactElement {
  return (
    <div className={styles["task-board-list-scroll"]}>
      <div
        id={props.listId}
        role="listbox"
        aria-label="タスク"
        className={styles["task-board-table"]}
      >
        <div className={styles["task-board-table-head"]} aria-hidden="true">
          <span>ID</span>
          <span>題</span>
          <span>難しさ</span>
          <span className={styles["task-board-cell-loop"]}>ループ可</span>
        </div>
        {props.stages.map((stage) => (
          <div
            key={stage.stage}
            role="group"
            aria-label={`${stage.label} ${String(stage.rows.length)}`}
            className={styles["task-board-stage"]}
          >
            <span className={styles["task-board-stage-head"]} aria-hidden="true">
              {stage.label}
              <span className={styles["task-board-stage-count"]}>{String(stage.rows.length)}</span>
            </span>
            {stage.rows.map((row) => (
              <TaskBoardOption key={row.id} row={row} onSelect={props.onSelect} />
            ))}
          </div>
        ))}
      </div>
      {props.stages.length === 0 && (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={taskBoardStyles["task-board-message"]}
        >
          当てはまるタスクが無い
        </Text>
      )}
      {props.omittedClosedCount > 0 && (
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["task-board-list-omitted"]}
        >
          一部のみ（閉じたタスクは新しいものだけで、ほか {props.omittedClosedCount}{" "}
          件は載っていません）
        </Text>
      )}
    </div>
  )
}

/** 名前は番号・題・状態（待ちの相手が無ければ読み上げだけ）・難しさ・ループ可の順に読める。 */
function TaskBoardOption(props: {
  readonly row: TaskBoardRow
  readonly onSelect: (id: string) => void
}): ReactElement {
  const row = props.row
  return (
    <div
      id={row.optionId}
      role="option"
      aria-selected={row.selected}
      data-state={row.state.kind}
      ref={row.selected ? scrollIntoNearest : undefined}
      className={styles["task-board-option"]}
      onClick={() => props.onSelect(row.id)}
    >
      <span className={styles["task-board-cell-id"]}>
        <TaskState state={row.state} display="mark" />
        <span className={styles["task-board-option-id"]}>{row.id}</span>
      </span>
      <span className={styles["task-board-cell-title"]}>
        <span className={styles["task-board-option-summary"]}>
          <TaskSummaryText parts={row.summary} />
        </span>
        {row.waiting === undefined ? (
          <VisuallyHidden element="span">{row.state.text}</VisuallyHidden>
        ) : (
          <span className={styles["task-board-option-waiting"]}>{row.waiting}</span>
        )}
        {row.outOfFilter && (
          <span className={styles["task-board-option-out-of-filter"]}>絞り込みの外</span>
        )}
      </span>
      <span>
        {row.difficulty !== undefined && <TaskDifficultyScale difficulty={row.difficulty} />}
      </span>
      <span className={styles["task-board-cell-loop"]}>
        {row.loopable === "Y" && <TaskLoopMark label="ループ可" />}
      </span>
    </div>
  )
}

/**
 * 選んだ行を一覧の内側で見える位置まで送る（↑↓ で画面の外の行へ移ったとき）。
 * 選ばれた行に付けたときだけ呼ばれるよう、モジュールの関数にして参照を変えない。
 */
function scrollIntoNearest(element: HTMLDivElement | null): void {
  element?.scrollIntoView({ block: "nearest" })
}
