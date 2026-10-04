// サイドバーの「タスク一覧」区画の見出し下に出す件数のチップの文言。

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"

export type TaskListCountItem = {
  readonly status: "all" | "doing" | "todo" | "done"
  readonly label: string
  readonly count: number
}

/** チップの絞り込みで選べる値。4チップの `status` と同じ4つだけ。既定は `"all"`。 */
export type TaskListFilterStatus = TaskListCountItem["status"]

/** チップの並び（すべて → 進行中 → 未着手 → 完了）と文言。件数はここでは持たない（`taskListCounts` が足す）。 */
const CHIP_ORDER = [
  { status: "all", label: "すべて" },
  { status: "doing", label: "進行中" },
  { status: "todo", label: "未着手" },
  { status: "done", label: "完了" },
] satisfies readonly { readonly status: TaskListFilterStatus; readonly label: string }[]

/**
 * サイドバーの「タスク一覧」のチップ。すべて → 進行中 → 未着手 → 完了の順で、0件でも出す。
 * 「すべて」の数は全件（3つのどれにも属さない想定外の status も含む）。
 *
 * tasks が読めていない（`kind` が `known` でない）ときはチップを出さない。
 * その判定は呼ぶ側が持ち、ここは件数を数えられる並びだけを受ける。
 */
export function taskListCounts(items: readonly TaskSummaryItem[]): readonly TaskListCountItem[] {
  const counts = taskStatusCounts(items)
  return CHIP_ORDER.map((chip) => ({ ...chip, count: counts[chip.status] }))
}

/** 絞り込んだ状態が0件になったときの一言に添える、チップと同じ文言。 */
export function taskListFilterLabel(status: TaskListFilterStatus): string {
  return CHIP_ORDER.find((chip) => chip.status === status)?.label ?? status
}

/** all（全件）・todo / doing / done の件数を、全件を1回だけ走査して数える。 */
function taskStatusCounts(tasks: readonly TaskSummaryItem[]): {
  readonly all: number
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
  return { all: tasks.length, todo, doing, done }
}
