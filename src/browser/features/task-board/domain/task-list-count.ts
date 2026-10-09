// サイドバーの「タスク一覧」区画の見出し下に出す件数のチップの文言。

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"

export type TaskListCountItem = {
  readonly status: "all" | "open" | "done"
  readonly label: string
  readonly count: number
}

/** チップの絞り込みで選べる値。3チップの `status` と同じ3つだけ。既定は `"all"`。 */
export type TaskListFilterStatus = TaskListCountItem["status"]

/** チップの並び（すべて → 未完了 → 完了）と文言。件数はここでは持たない（`taskListCounts` が足す）。 */
const CHIP_ORDER = [
  { status: "all", label: "すべて" },
  { status: "open", label: "未完了" },
  { status: "done", label: "完了" },
] satisfies readonly { readonly status: TaskListFilterStatus; readonly label: string }[]

/**
 * サイドバーの「タスク一覧」のチップ。すべて → 未完了 → 完了の順で、0件でも出す。
 * 「未完了」は done 以外のすべて（保留・想定外の status も含む）なので、未完了と完了を足すと「すべて」になる。
 *
 * tasks が読めていない（`kind` が `known` でない）ときはチップを出さない。
 * その判定は呼ぶ側が持ち、ここは件数を数えられる並びだけを受ける。
 */
export function taskListCounts(items: readonly TaskSummaryItem[]): readonly TaskListCountItem[] {
  const done = items.filter((task) => task.status === "done").length
  const counts = { all: items.length, open: items.length - done, done }
  return CHIP_ORDER.map((chip) => ({ ...chip, count: counts[chip.status] }))
}

/** 絞り込んだ状態が0件になったときの一言に添える、チップと同じ文言。 */
export function taskListFilterLabel(status: TaskListFilterStatus): string {
  return CHIP_ORDER.find((chip) => chip.status === status)?.label ?? status
}
