// 進行中（doing）のタスクを、区画の一覧の先頭にカードで出す。カード全体が1つのボタンで、押すとのぞき窓が開く。
// 他の行と違い summary は1行に切り詰めず、折り返して全文を出す（進行中は件数が少なく、いま何をしているかを読みたいため）。
//
// 1行目に「進行中」の札とIDと右端の `›`、2行目に summary を置く。

import { ChevronRight } from "lucide-react"
import type { ReactElement } from "react"

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { Text } from "../../../components/ui/text/text.tsx"
import { codeSpanParts } from "../../../domain/code-span.ts"
import taskBoardStyles from "../task-board.module.css"
import type { TaskItemPeek } from "./task-item.tsx"
import styles from "./task-running-card.module.css"
import { TaskSummaryText } from "./task-summary-text.tsx"

export function TaskRunningCard(props: {
  readonly task: TaskSummaryItem
  readonly rowId: string
  readonly peek: TaskItemPeek
  readonly onToggle: () => void
}): ReactElement {
  return (
    <li className={styles["task-running-item"]}>
      <button
        type="button"
        id={props.rowId}
        aria-haspopup="dialog"
        aria-expanded={props.peek.kind === "open"}
        aria-controls={props.peek.kind === "open" ? props.peek.controls : undefined}
        className={taskBoardStyles["task-running-card"]}
        onClick={props.onToggle}
      >
        <span className={styles["task-running-head"]}>
          <span className={styles["task-running-badge"]}>進行中</span>
          <span className={taskBoardStyles["task-id"]}>{props.task.id}</span>
          <ChevronRight
            className={styles["task-running-chevron"]}
            size={14}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>
        <Text
          element="span"
          size="label"
          tone="inherit"
          weight="inherit"
          className={styles["task-running-body"]}
        >
          <TaskSummaryText parts={codeSpanParts(props.task.summary)} />
        </Text>
      </button>
      {props.peek.kind === "open" && props.peek.element}
    </li>
  )
}
