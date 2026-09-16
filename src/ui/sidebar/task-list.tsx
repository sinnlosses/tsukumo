// サイドバーの「タスク一覧」。**status ごとにまとめず、ファイルの順で出す**
// （develop/tasks.json の決定）。`done` は薄く出す。読めない・まだ届いていないときは undefined。
//
// 区画が狭いので**畳んで開く**（docs/requirements.md 4.2）。畳んだ状態（既定）は `done` を
// 除いた先頭数件だけを出し、残りの件数を1行添える。開いた状態は `done` も含めて全件出す。
// **どちらの状態でも並べ替えはしない**（畳んだ状態は `done` を除いた部分列で、ファイルの順のまま）。

import { type ReactElement } from "react"

import { type TaskSummaryItem } from "../../protocol/task-summary.ts"

export type TaskListProps = {
  readonly tasks: readonly TaskSummaryItem[] | undefined
  readonly expanded: boolean
}

/** 畳んだ状態で出す件数。区画が中身なりの高さで止まるので、行数の上限がそのまま区画の高さになる。 */
const COLLAPSED_COUNT = 3

/**
 * サイドバーの「タスク一覧」の見出し。tasks が読めているときだけ todo / done の件数を添える
 * （develop/tasks.json が不明なときは件数も不明なので、見出しはそのまま）。
 */
export function taskListTitle(tasks: readonly TaskSummaryItem[] | undefined): string {
  if (tasks === undefined) {
    return "タスク一覧"
  }

  const todo = tasks.filter((task) => task.status === "todo").length
  const done = tasks.filter((task) => task.status === "done").length
  return `タスク一覧 todo ${String(todo)} / done ${String(done)}`
}

export function TaskList(props: TaskListProps): ReactElement {
  if (props.tasks === undefined) {
    return <p className="sidebar-empty">不明</p>
  }
  if (props.tasks.length === 0) {
    return <p className="sidebar-empty">タスクが無い</p>
  }

  const shown = props.expanded ? props.tasks : collapsedTasks(props.tasks)
  const hidden = props.tasks.length - shown.length

  return (
    <>
      {shown.length === 0 ? null : (
        <ul className="sidebar-list task-list">
          {shown.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </ul>
      )}
      {hidden === 0 ? null : <p className="task-more">{`ほか ${String(hidden)} 件`}</p>}
    </>
  )
}

/** 畳んだ状態で出す分。`done` を落とした部分列の先頭から取るだけで、順番は入れ替えない。 */
function collapsedTasks(tasks: readonly TaskSummaryItem[]): readonly TaskSummaryItem[] {
  return tasks.filter((task) => task.status !== "done").slice(0, COLLAPSED_COUNT)
}

/**
 * タスク一覧1件分。バッジ（status）を先頭列、ID＋summary を2列目に置く2列の grid 行
 * （`.task-item` の `grid-template-columns: auto 1fr`。`src/ui/style/sidebar.css`）。
 */
function TaskItem(props: { readonly task: TaskSummaryItem }): ReactElement {
  const doneClass = props.task.status === "done" ? " task-done" : ""

  return (
    <li className={`task-item${doneClass}`}>
      <span className="task-status-cell">
        {props.task.status === undefined ? null : <TaskStatusBadge status={props.task.status} />}
      </span>
      <span className="task-body">
        <span className="task-id">{props.task.id}</span> {props.task.summary}
      </span>
    </li>
  )
}

function TaskStatusBadge(props: { readonly status: string }): ReactElement {
  return <span className={`task-status ${taskStatusClass(props.status)}`}>{props.status}</span>
}

/** todo / done は色で区別し、それ以外（in-progress など）は注意色にする。文字は status のまま出す。 */
function taskStatusClass(status: string): string {
  if (status === "todo") {
    return "task-status-todo"
  }
  if (status === "done") {
    return "task-status-done"
  }
  return "task-status-other"
}
