// 区画の一覧1件分（進行中を除いた「残り」）。行全体が1つのボタンで、押すとのぞき窓が開く。
// 印・ID・題（1行で末尾「…」）・`↻`・`›` の5列の grid。属性のうち `loopable` だけを `↻` で出し（難しさは出さない）、`todo` と `hold` の行に限る。
// 開いているときは、窓をボタンの後ろ（同じ `<li>` の中）に置く。

import clsx from "clsx"
import { ChevronRight } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { hasTaskStatus, type TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { codeSpanParts } from "../../../domain/code-span.ts"
import taskBoardStyles from "../task-board.module.css"
import styles from "./task-item.module.css"
import { TaskMark } from "./task-mark.tsx"
import { TaskSummaryText } from "./task-summary-text.tsx"

export function TaskItem(props: {
  readonly task: TaskSummaryItem
  readonly rowId: string
  readonly peek: TaskItemPeek
  readonly onToggle: () => void
}): ReactElement {
  const open = props.peek.kind === "open"
  return (
    <li
      className={clsx(
        taskBoardStyles["task-item"],
        hasTaskStatus(props.task, "done") && taskBoardStyles["task-done"],
      )}
    >
      <button
        type="button"
        id={props.rowId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={props.peek.kind === "open" ? props.peek.controls : undefined}
        className={styles["task-item-row"]}
        onClick={props.onToggle}
      >
        <span className={styles["task-item-mark"]}>
          <TaskMark status={props.task.status} waiting={props.task.waitingFor.length > 0} />
        </span>
        <span className={taskBoardStyles["task-id"]}>{props.task.id}</span>
        <span className={styles["task-item-summary"]}>
          <TaskSummaryText parts={codeSpanParts(props.task.summary)} />
        </span>
        <TaskLoopMark task={props.task} />
        <ChevronRight
          className={taskBoardStyles["task-row-chevron"]}
          size={14}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      {props.peek.kind === "open" && props.peek.element}
    </li>
  )
}

/** `↻`。末尾の異体字選択子（U+FE0E）で、絵文字ではなく文字の字形に固定する。 */
export const LOOP_GLYPH = String.fromCodePoint(0x21bb, 0xfe0e)

/** `todo` と `hold` の行の `↻` 列。列は常に埋め、`todo`・`hold` 以外では空の枠だけを置く。 */
function TaskLoopMark(props: { readonly task: TaskSummaryItem }): ReactElement {
  const { task } = props
  if (!hasTaskStatus(task, "todo") && !hasTaskStatus(task, "hold")) {
    return <span aria-hidden="true" />
  }
  if (task.loopable !== "Y") {
    return (
      <span className={styles["task-item-loop-none"]} title="ループ不可・未設定">
        ·
      </span>
    )
  }
  const waiting = hasTaskStatus(task, "hold") || task.waitingFor.length > 0
  return (
    <span
      className={clsx(styles["task-item-loop"], waiting && styles["task-item-loop-waiting"])}
      title={waiting ? "ループ可（待ちが解けたら）" : "ループ可"}
    >
      {LOOP_GLYPH}
    </span>
  )
}

/** 行の窓。開いているときは、窓の DOM の id（`aria-controls`）と窓そのもの。 */
export type TaskItemPeek =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly controls: string; readonly element: ReactNode }
