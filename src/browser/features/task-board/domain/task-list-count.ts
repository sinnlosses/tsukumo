// サイドバーの「タスク一覧」区画の見出し下に出す件数のチップ。文言だけをここから渡す
// （`features/sidebar/task-section.tsx`）。見出しの文言そのものは固定の「タスク」になった
// ので、この機能はもう持たない（以前は `taskListTitle` が「タスク一覧 todo N / doing N /
// done N」を組み立てていた。経緯は docs/requirements.md 4.2）。

import { type TaskSummaryItem } from "../../../../shared/task-summary.ts"

export type TaskListCountItem = {
  readonly label: string
  readonly count: number
}

/**
 * サイドバーの「タスク一覧」のチップ。**進行中 → 未着手 → 完了の順で、0件でも出す**
 * （モックの3チップが常に並ぶ形に合わせる。`taskListTitle` 時代の「0件は足さない」は
 * 採らない。経緯は docs/requirements.md 4.2）。
 *
 * tasks が読めていない（`kind: "unknown"`）ときはチップを出さない。その判定は呼ぶ側
 * （`features/sidebar/task-section.tsx`）が持ち、ここは件数を数えられる並びだけを受ける。
 */
export function taskListCounts(items: readonly TaskSummaryItem[]): readonly TaskListCountItem[] {
  const { todo, doing, done } = taskStatusCounts(items)
  return [
    { label: "進行中", count: doing },
    { label: "未着手", count: todo },
    { label: "完了", count: done },
  ]
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
