// 区画の一覧1件分（進行中を除いた「残り」）。
// 先頭列に status の印（丸・チェック）、2列目にID＋summary を置く2列の grid 行。
// IDを押せる部品にするのは着手できるタスク（`runnable`）だけで、それ以外は字のまま出す。
//
// 色だけで状態を伝えない: todo は空の丸、done はチェックの印（字も打ち消し線にする）、想定外の値は注意色の「!」にする。
// summary は1行に収め、入りきらない分は末尾を「…」にする（全文を読みたいときは「一覧を見る」のモーダルを開く）。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { Text } from "../../../components/ui/text/text.tsx"
import taskBoardStyles from "../task-board.module.css"
import styles from "./task-item.module.css"
import { TaskRunButton } from "./task-run-button.tsx"

export function TaskItem(props: {
  readonly task: TaskSummaryItem
  readonly runnable: boolean
}): ReactElement {
  return (
    <li
      className={clsx(
        taskBoardStyles["task-item"],
        props.task.status === "done" && taskBoardStyles["task-done"],
      )}
    >
      <span>
        <TaskMark status={props.task.status} />
      </span>
      <span className={styles["task-item-body"]}>
        {props.runnable ? (
          <TaskRunButton taskId={props.task.id} />
        ) : (
          <span className={taskBoardStyles["task-id"]}>{props.task.id}</span>
        )}
        <Text
          element="span"
          size="secondary"
          tone="inherit"
          weight="inherit"
          className={styles["task-item-summary"]}
        >
          {props.task.summary}
        </Text>
      </span>
    </li>
  )
}

/**
 * status ごとの印。status が無い要素（一覧の要素そのものは壊れていないが status だけ読めない）は印を出さない。
 * todo / done 以外（想定外の値）は、詳しい文字列を持ち込まず注意色の印だけにする（「一覧を見る」のモーダルに status の値がそのまま出る）。
 */
function TaskMark(props: { readonly status: string | undefined }): ReactElement | null {
  if (props.status === undefined) {
    return null
  }
  if (props.status === "todo") {
    return <span className={styles["task-mark-todo"]} title="未着手" />
  }
  if (props.status === "done") {
    return <span className={styles["task-mark-done"]} title="完了" />
  }
  return <span className={styles["task-mark-other"]} title={props.status} />
}
