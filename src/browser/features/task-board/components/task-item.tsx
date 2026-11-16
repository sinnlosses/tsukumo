// 区画の一覧1件分。行全体が1つのボタンで、押すとプレビューが開く。
// 1段目は状態の印と題（2行まで）、2段目は待ちの相手・ID・∞・難しさの語。
// ∞ はループ可の `todo` と `hold` の行に限り、難しさは決まっているときだけ出す。
// 開いているときは、プレビューをボタンの後ろ（同じ `<li>` の中）に置く。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import { hasTaskStatus, type TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { codeSpanParts } from "../../../domain/code-span.ts"
import { taskStateOf } from "../domain/task-board-content.ts"
import { isSearching, titleMatchParts } from "../domain/task-search.ts"
import taskBoardStyles from "../task-board.module.css"
import { TaskSummaryText } from "../task-summary-text.tsx"
import { TaskDifficultyWord, TaskLoopMark } from "./task-attribute.tsx"
import styles from "./task-item.module.css"
import { TaskState } from "./task-state.tsx"
import { TaskSummaryHighlight } from "./task-summary-highlight.tsx"

export function TaskItem(props: {
  readonly task: TaskSummaryItem
  readonly rowId: string
  /** 探している語。空なら題はそのまま描く。 */
  readonly query: string
  /** 探す欄の ↑↓ で選んでいる行。 */
  readonly active: boolean
  readonly peek: TaskItemPeek
  readonly onToggle: () => void
}): ReactElement {
  const open = props.peek.kind === "open"
  const state = taskStateOf(props.task)
  const waitingText = state.kind === "blocked" || state.kind === "hold" ? state.text : undefined
  return (
    <li className={taskBoardStyles["task-item"]}>
      <button
        type="button"
        id={props.rowId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={props.peek.kind === "open" ? props.peek.controls : undefined}
        aria-selected={props.active ? true : undefined}
        ref={props.active ? scrollIntoNearest : undefined}
        className={clsx(
          styles["task-item-row"],
          state.kind === "doing" && styles["task-item-doing"],
          props.active && styles["task-item-active"],
        )}
        onClick={props.onToggle}
      >
        <span className={styles["task-item-mark"]}>
          {props.task.status.kind !== "none" && <TaskState state={state} display="mark" />}
        </span>
        <span className={styles["task-item-text"]}>
          <span className={styles["task-item-summary"]}>
            {isSearching(props.query) ? (
              <TaskSummaryHighlight
                parts={titleMatchParts(codeSpanParts(props.task.summary), props.query)}
              />
            ) : (
              <TaskSummaryText parts={codeSpanParts(props.task.summary)} />
            )}
          </span>
          <span className={styles["task-item-meta"]}>
            {waitingText !== undefined && (
              <span className={styles["task-item-waiting"]}>{waitingText}</span>
            )}
            <span className={taskBoardStyles["task-id"]}>{props.task.id}</span>
            {showsLoop(props.task) && <TaskRowLoop task={props.task} />}
            {props.task.difficulty !== undefined && (
              <TaskDifficultyWord difficulty={props.task.difficulty} scale={false} />
            )}
          </span>
        </span>
      </button>
      {props.peek.kind === "open" && props.peek.element}
    </li>
  )
}

/** 選んだ行に付けたときだけ呼ばれるよう、モジュールの関数にして参照を変えない。 */
function scrollIntoNearest(element: HTMLButtonElement | null): void {
  element?.scrollIntoView({ block: "nearest" })
}

function showsLoop(task: TaskSummaryItem): boolean {
  return (hasTaskStatus(task, "todo") || hasTaskStatus(task, "hold")) && task.loopable === "Y"
}

function TaskRowLoop(props: { readonly task: TaskSummaryItem }): ReactElement {
  const { task } = props
  const waiting = hasTaskStatus(task, "hold") || task.waitingFor.length > 0
  return (
    <span
      className={clsx(styles["task-item-loop"], waiting && styles["task-item-loop-waiting"])}
      title={waiting ? "ループ可（待ちが解けたら）" : "ループ可"}
    >
      <TaskLoopMark label={waiting ? "ループ可（待ちが解けたら）" : "ループ可"} />
    </span>
  )
}

/** 行のプレビュー。開いているときは、プレビューの DOM の id（`aria-controls`）とプレビューそのもの。 */
export type TaskItemPeek =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly controls: string; readonly element: ReactNode }
