// サイドバーの「タスク一覧」。進行中（doing）だけ先頭のカードにまとめ、残りはファイルの順で出す（todo と done は混ざったまま）。
// `done` は薄く打ち消し線で出す。IDを押して実行を頼めるのは、依存が済んだ `todo` だけ。
// 絞り込みで隠れた依存も止めるので、着手できるかは絞る前の全件で判定する。
// 読めない・まだ届いていないときは undefined。
//
// 区画には全件を並べ、入りきらない分は区画の内側でスクロールする。
// 一覧を見渡すのは見出しの「一覧を見る」から開くモーダルの仕事で、ここは直近の並びを視界の端に置いておくだけ。
//
// 件数のチップで絞れる。並びは変えず、出す・出さないだけを決めてから `orderTasksForSidebar` に渡す。
// 絞った結果が0件のときは「タスクが無い」ではなく、選んだ状態の名前を添えた一言にする（全件が0件のときと区別する）。
//
// 区画の枠と見出しはサイドバーの持ち物で、ここは中身だけを描く。

import type { ReactElement } from "react"

import {
  taskReadiness,
  unfinishedTaskIds,
  type TaskSummaryResult,
} from "../../../shared/repository/task-summary.ts"
import { Text } from "../../components/ui/text/text.tsx"
import { TaskItem } from "./components/task-item.tsx"
import { TaskRunningCard } from "./components/task-running-card.tsx"
import { taskListFilterLabel, type TaskListFilterStatus } from "./domain/task-list-count.ts"
import { filterTasksForSidebar } from "./domain/task-sidebar-filter.ts"
import { orderTasksForSidebar } from "./domain/task-sidebar-order.ts"
import styles from "./task-board.module.css"

export type TaskListProps = {
  readonly tasks: TaskSummaryResult
  readonly selectedStatus: TaskListFilterStatus | undefined
}

export function TaskList(props: TaskListProps): ReactElement {
  if (props.tasks.kind !== "known") {
    return (
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="inherit"
        className={styles["task-empty"]}
      >
        不明
      </Text>
    )
  }
  if (props.tasks.items.length === 0) {
    return (
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="inherit"
        className={styles["task-empty"]}
      >
        タスクが無い
      </Text>
    )
  }

  const filtered = filterTasksForSidebar(props.tasks.items, props.selectedStatus)
  if (filtered.length === 0 && props.selectedStatus !== undefined) {
    return (
      <Text
        element="p"
        size="inherit"
        tone="ink-quiet"
        weight="inherit"
        className={styles["task-empty"]}
      >
        {taskListFilterLabel(props.selectedStatus)}のタスクが無い
      </Text>
    )
  }

  const { running, rest } = orderTasksForSidebar(filtered)
  const unfinished = unfinishedTaskIds(props.tasks.items)

  return (
    <>
      {running.length > 0 && (
        <ul className={styles["task-running-list"]}>
          {running.map((task) => (
            <TaskRunningCard key={task.id} task={task} />
          ))}
        </ul>
      )}
      <ul className={styles["task-list"]}>
        {rest.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            runnable={taskReadiness(task, unfinished)?.kind === "ready"}
          />
        ))}
      </ul>
    </>
  )
}
