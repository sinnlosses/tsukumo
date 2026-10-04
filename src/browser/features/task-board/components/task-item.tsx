// 区画の一覧1件分（進行中を除いた「残り」）。行全体が1つのボタンで、押すとのぞき窓が開く。
// 印・ID・題（1行で末尾「…」）・`›` の4列の grid。開いているときは、窓をボタンの後ろ（同じ `<li>` の中）に置く。

import clsx from "clsx"
import { ChevronRight } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
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
        props.task.status === "done" && taskBoardStyles["task-done"],
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
          <TaskMark status={props.task.status} />
        </span>
        <span className={taskBoardStyles["task-id"]}>{props.task.id}</span>
        <span className={styles["task-item-summary"]}>
          <TaskSummaryText parts={codeSpanParts(props.task.summary)} />
        </span>
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

/** 行の窓。開いているときは、窓の DOM の id（`aria-controls`）と窓そのもの。 */
export type TaskItemPeek =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly controls: string; readonly element: ReactNode }
