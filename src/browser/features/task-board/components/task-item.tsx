// 区画の一覧1件分。行全体が1つのボタンで、押すとサイドシートが開く。
// 1段目は状態の印と題（2行まで）、2段目は ID・難しさの目盛り・∞ の順。
// 保留・待ちは状態の印が言うので字にしない。
// 難しさと ∞ は無いときも幅を取る空欄にして、行をまたいで縦の位置をそろえる。
// ∞ はループ可の `todo` と `hold` の行に限り、難しさは決まっているときだけ出す。

import clsx from "clsx"
import type { ReactElement } from "react"

import { hasTaskStatus, type TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { codeSpanParts } from "../../../domain/code-span.ts"
import { taskStateOf } from "../domain/task-board-content.ts"
import { TASK_SHEET_DOM_ID } from "../domain/task-row-dom-id.ts"
import { isSearching, titleMatchParts } from "../domain/task-search.ts"
import taskBoardStyles from "../task-board.module.css"
import { TaskSummaryText } from "../task-summary-text.tsx"
import { TaskDifficultyScale, TaskLoopMark } from "./task-attribute.tsx"
import styles from "./task-item.module.css"
import { TaskState } from "./task-state.tsx"
import { TaskSummaryHighlight } from "./task-summary-highlight.tsx"
import { TaskWorkRepo } from "./task-work-repo.tsx"

export function TaskItem(props: {
  readonly task: TaskSummaryItem
  readonly rowId: string
  /** 探している語。空なら題はそのまま描く。 */
  readonly query: string
  /** 探す欄の ↑↓ で選んでいる行。 */
  readonly active: boolean
  /** サイドシートで開いている行。 */
  readonly open: boolean
  readonly onToggle: () => void
}): ReactElement {
  const { open } = props
  const state = taskStateOf(props.task)
  return (
    <li className={taskBoardStyles["task-item"]}>
      <button
        type="button"
        id={props.rowId}
        aria-expanded={open}
        aria-controls={open ? TASK_SHEET_DOM_ID : undefined}
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
            <span className={taskBoardStyles["task-id"]}>{props.task.id}</span>
            {props.task.workRepo !== undefined && <TaskWorkRepo name={props.task.workRepo} />}
            <span className={styles["task-item-difficulty"]}>
              {props.task.difficulty !== undefined && (
                <TaskDifficultyScale difficulty={props.task.difficulty} />
              )}
            </span>
            <span className={styles["task-item-loop-slot"]}>
              {showsLoop(props.task) && <TaskRowLoop task={props.task} />}
            </span>
          </span>
        </span>
      </button>
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
