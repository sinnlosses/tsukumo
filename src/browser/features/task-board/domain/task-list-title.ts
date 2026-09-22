// サイドバーの区画の見出しに出す文言。区画の枠はサイドバーが持つので、**文言だけ**をここから
// 渡す（`features/sidebar/task-section.tsx`）。

import { type TaskSummaryItem, type TaskSummaryResult } from "../../../../shared/task-summary.ts"

/**
 * サイドバーの「タスク一覧」の見出し。tasks が読めているときだけ件数を添える
 * （develop/tasks.json が不明なときは件数も不明なので、見出しはそのまま）。
 *
 * todo は常に出す。doing / done は 0 件のときは足さない（`loopable` の `N` を空欄にするのと
 * 同じ理由。区画は 300px ほどしかなく、doing はほぼ常に 0〜1、done はアーカイブ直後は
 * ほぼ常に 0 になるので、0 を並べても情報が無い。詳しい理由は docs/requirements.md 4.2）。
 */
export function taskListTitle(tasks: TaskSummaryResult): string {
  if (tasks.kind === "unknown") {
    return "タスク一覧"
  }

  const { todo, doing, done } = taskStatusCounts(tasks.items)

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
