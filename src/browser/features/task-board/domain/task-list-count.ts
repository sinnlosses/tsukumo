// サイドバーの「タスク一覧」区画の見出し下に出す件数のチップの文言。

import { hasTaskStatus, type TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"

export type TaskListCountItem = {
  readonly status: "all" | "open" | "draft" | "done"
  readonly label: string
  readonly count: number
}

/** チップの絞り込みで選べる値。4チップの `status` と同じ4つだけ。既定は `"all"`。 */
export type TaskListFilterStatus = TaskListCountItem["status"]

/** チップの並びと文言。件数はここでは持たない（`taskListCounts` が足す）。 */
const CHIP_ORDER = [
  { status: "all", label: "すべて" },
  { status: "open", label: "未完了" },
  { status: "draft", label: "ドラフト" },
  { status: "done", label: "完了" },
] satisfies readonly { readonly status: TaskListFilterStatus; readonly label: string }[]

/**
 * サイドバーの「タスク一覧」のチップ。すべて → 未完了 → ドラフト → 完了の順で、0件でも出す。
 * 「未完了」は done と draft 以外のすべて（保留・想定外の status も含む）なので、未完了とドラフトと完了を足すと「すべて」になる。
 *
 * tasks が読めていない（`kind` が `known` でない）ときはチップを出さない。
 * その判定は呼ぶ側が持ち、ここは件数を数えられる並びだけを受ける。
 */
export function taskListCounts(items: readonly TaskSummaryItem[]): readonly TaskListCountItem[] {
  const done = items.filter((task) => hasTaskStatus(task, "done")).length
  const draft = items.filter((task) => hasTaskStatus(task, "draft")).length
  const counts = { all: items.length, open: items.length - done - draft, draft, done }
  return CHIP_ORDER.map((chip) => ({ ...chip, count: counts[chip.status] }))
}

/** 絞り込んだ状態が0件になったときの一言に添える、チップと同じ文言。 */
export function taskListFilterLabel(status: TaskListFilterStatus): string {
  return CHIP_ORDER.find((chip) => chip.status === status)?.label ?? status
}
