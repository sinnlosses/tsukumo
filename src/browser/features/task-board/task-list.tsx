// サイドバーの「タスク一覧」。**進行中（doing）だけ先頭のカードにまとめ、残りはファイルの順**
// で出す（`domain/task-sidebar-order.ts`。todo と done は混ざったまま。経緯は
// docs/display.md 4.2）。`done` は薄く打ち消し線で出す。読めない・まだ届いていないときは
// undefined。
//
// **区画には全件を並べ、入りきらない分は区画の内側でスクロールする。** 一覧を見渡すのは
// 見出しの「一覧を見る」から開く表（`task-board.tsx`）の仕事で、ここは直近の並びを
// 視界の端に置いておくだけ（docs/display.md 4.2）。
//
// **件数のチップで絞れる**（`selectedStatus` は `components/domain/sidebar/task-section.tsx` の
// state。並びは変えず、`domain/task-sidebar-filter.ts` で出す・出さないだけを決めてから
// `orderTasksForSidebar` に渡す。経緯は docs/display.md 4.2）。絞った結果が0件のときは
// 「タスクが無い」ではなく、選んだ状態の名前を添えた一言にする（全件が0件のときと区別する）。
//
// **置き場所（サイドバーの区画）はサイドバーの持ち物で、ここは中身だけを描く。** 区画の枠と
// 見出しは `components/domain/sidebar/section.tsx` にある（docs/design.md 2章）。

import { type ReactElement } from "react"

import { type TaskSummaryResult } from "../../../shared/task-summary.ts"
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
  if (props.tasks.kind === "unknown") {
    return <p className={styles["task-empty"]}>不明</p>
  }
  if (props.tasks.items.length === 0) {
    return <p className={styles["task-empty"]}>タスクが無い</p>
  }

  const filtered = filterTasksForSidebar(props.tasks.items, props.selectedStatus)
  if (filtered.length === 0 && props.selectedStatus !== undefined) {
    return (
      <p className={styles["task-empty"]}>
        {taskListFilterLabel(props.selectedStatus)}のタスクが無い
      </p>
    )
  }

  const { running, rest } = orderTasksForSidebar(filtered)

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
          <TaskItem key={task.id} task={task} />
        ))}
      </ul>
    </>
  )
}
