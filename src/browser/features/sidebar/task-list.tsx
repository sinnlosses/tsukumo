// サイドバーの「タスク一覧」。**status ごとにまとめず、ファイルの順で出す**
// （develop/tasks.json の決定）。`done` は薄く出す。読めない・まだ届いていないときは undefined。
//
// **区画には全件を並べ、入りきらない分は区画の内側でスクロールする。** 一覧を見渡すのは
// 見出しの「一覧を見る」から開く表（`task-board.tsx`）の仕事で、ここは直近の並びを
// 視界の端に置いておくだけ（docs/requirements.md 4.2）。

import { type ReactElement } from "react"

import { type TaskSummaryItem } from "../../../shared/task-summary.ts"
import styles from "./sidebar.module.css"

export type TaskListProps = {
  readonly tasks: readonly TaskSummaryItem[] | undefined
}

/**
 * サイドバーの「タスク一覧」の見出し。tasks が読めているときだけ件数を添える
 * （develop/tasks.json が不明なときは件数も不明なので、見出しはそのまま）。
 *
 * todo は常に出す。doing / done は 0 件のときは足さない（`loopable` の `N` を空欄にするのと
 * 同じ理由。区画は 300px ほどしかなく、doing はほぼ常に 0〜1、done はアーカイブ直後は
 * ほぼ常に 0 になるので、0 を並べても情報が無い。詳しい理由は docs/requirements.md 4.2）。
 */
export function taskListTitle(tasks: readonly TaskSummaryItem[] | undefined): string {
  if (tasks === undefined) {
    return "タスク一覧"
  }

  const { todo, doing, done } = taskStatusCounts(tasks)

  const doingPart = doing > 0 ? ` / doing ${String(doing)}` : ""
  const donePart = done > 0 ? ` / done ${String(done)}` : ""
  return `タスク一覧 todo ${String(todo)}${doingPart}${donePart}`
}

/** todo / doing / done の件数を、全件を1回だけ走査して数える。 */
function taskStatusCounts(tasks: readonly TaskSummaryItem[]): {
  readonly todo: number
  readonly doing: number
  readonly done: number
} {
  let todo = 0
  let doing = 0
  let done = 0
  for (const task of tasks) {
    if (task.status === "todo") {
      todo += 1
    } else if (task.status === "doing") {
      doing += 1
    } else if (task.status === "done") {
      done += 1
    }
  }
  return { todo, doing, done }
}

export function TaskList(props: TaskListProps): ReactElement {
  if (props.tasks === undefined) {
    return <p className={styles["sidebar-empty"]}>不明</p>
  }
  if (props.tasks.length === 0) {
    return <p className={styles["sidebar-empty"]}>タスクが無い</p>
  }

  return (
    <ul className={`${styles["sidebar-list"]} ${styles["task-list"]}`}>
      {props.tasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </ul>
  )
}

/**
 * タスク一覧1件分。バッジ（status）を先頭列、ID＋summary を2列目に置く2列の grid 行
 * （`.task-item` の `grid-template-columns: auto 1fr`。`sidebar.module.css`）。
 */
function TaskItem(props: { readonly task: TaskSummaryItem }): ReactElement {
  const doneClass = props.task.status === "done" ? ` ${styles["task-done"]}` : ""

  return (
    <li className={`${styles["task-item"]}${doneClass}`}>
      <span>
        {props.task.status === undefined ? null : <TaskStatusBadge status={props.task.status} />}
      </span>
      <span>
        <span className={styles["task-id"]}>{props.task.id}</span> {props.task.summary}
      </span>
    </li>
  )
}

function TaskStatusBadge(props: { readonly status: string }): ReactElement {
  return (
    <span className={`${styles["task-status"]} ${taskStatusClass(props.status)}`}>
      {props.status}
    </span>
  )
}

/** todo / doing / done は色で区別し、それ以外（想定外の値）は注意色にする。文字は status のまま出す。 */
function taskStatusClass(status: string): string {
  if (status === "todo") {
    return styles["task-status-todo"] ?? ""
  }
  if (status === "doing") {
    return styles["task-status-doing"] ?? ""
  }
  if (status === "done") {
    return styles["task-status-done"] ?? ""
  }
  return styles["task-status-other"] ?? ""
}
