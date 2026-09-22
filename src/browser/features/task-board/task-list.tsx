// サイドバーの「タスク一覧」。**status ごとにまとめず、ファイルの順で出す**
// （develop/tasks.json の決定）。`done` は薄く出す。読めない・まだ届いていないときは undefined。
//
// **区画には全件を並べ、入りきらない分は区画の内側でスクロールする。** 一覧を見渡すのは
// 見出しの「一覧を見る」から開く表（`task-board.tsx`）の仕事で、ここは直近の並びを
// 視界の端に置いておくだけ（docs/requirements.md 4.2）。
//
// **置き場所（サイドバーの区画）はサイドバーの持ち物で、ここは中身だけを描く。** 区画の枠と
// 見出しは `features/sidebar/section.tsx` にある（docs/design.md 2章）。

import { type ReactElement } from "react"

import { type TaskSummaryResult } from "../../../shared/task-summary.ts"
import { TaskItem } from "./components/task-item.tsx"
import styles from "./task-board.module.css"

export type TaskListProps = {
  readonly tasks: TaskSummaryResult
}

export function TaskList(props: TaskListProps): ReactElement {
  if (props.tasks.kind === "unknown") {
    return <p className={styles["task-empty"]}>不明</p>
  }
  if (props.tasks.items.length === 0) {
    return <p className={styles["task-empty"]}>タスクが無い</p>
  }

  return (
    <ul className={styles["task-list"]}>
      {props.tasks.items.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </ul>
  )
}
