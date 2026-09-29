// 進行中（doing）のタスクを、区画の一覧の先頭にカードで出す。
// 他の行と違い summary は1行に切り詰めず、折り返して全文を出す（進行中は件数が少なく、いま何をしているかを読みたいため）。
//
// 1行目に「進行中」の札とID（Beads 方式では着手した作業ツリーの名前をIDの後ろに添える）、2行目に summary を置く。

import type { ReactElement } from "react"

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { HStack } from "../../../components/ui/h-stack/h-stack.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import styles from "../task-board.module.css"

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
        <span className={styles["task-id"]}>{props.task.id}</span>
        {props.task.assignee !== undefined && (
          <span className={styles["task-running-assignee"]} title="着手した作業ツリー">
            {props.task.assignee}
          </span>
        )}
      </HStack>
      <Text
        element="span"
        size="secondary"
        tone="inherit"
        weight="inherit"
        className={styles["task-running-body"]}
      >
        {props.task.summary}
      </Text>
    </li>
  )
}
