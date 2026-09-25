// 進行中（doing）のタスクを、区画の一覧の先頭にカードで出す。他の行と違い**summary は折り返して
// 全文を出す**（1行に切り詰めない。進行中は件数が少なく、いま何をしているかを読みたいため）。
// 2件以上あれば、この部品を2枚以上並べる（`task-list.tsx`）。並びの決定の経緯は
// docs/display.md 4.2。
//
// 1行目に「進行中」の札とID、2行目にsummaryを置く2行の構成（サイドバーのモック参照。
// `docs/history/mockup/` の同名の .png / .html）。

import { type ReactElement } from "react"

import { type TaskSummaryItem } from "../../../../shared/task-summary.ts"
import { HStack } from "../../../components/ui/h-stack/h-stack.tsx"
import styles from "../task-board.module.css"
import { TaskRunButton } from "./task-run-button.tsx"

export function TaskRunningCard(props: { readonly task: TaskSummaryItem }): ReactElement {
  return (
    <li className={styles["task-running-card"]}>
      <HStack
        element="span"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="center"
        justify="start"
        wrap="nowrap"
        className=""
      >
        <span className={styles["task-running-badge"]}>進行中</span>
        <TaskRunButton taskId={props.task.id} />
      </HStack>
      <span className={styles["task-running-body"]}>{props.task.summary}</span>
    </li>
  )
}
