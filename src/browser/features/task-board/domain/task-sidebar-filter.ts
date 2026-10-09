// サイドバーの件数のチップで絞り込んだときに区画の一覧へ出す並び。
// 並びは変えず、`orderTasksForSidebar` の前段として出す・出さないだけをここで決める。

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import type { TaskListFilterStatus } from "./task-list-count.ts"

/** 選んだ状態のタスクだけを残す。「すべて」のときは全件をそのまま返す。 */
export function filterTasksForSidebar(
  items: readonly TaskSummaryItem[],
  selected: TaskListFilterStatus,
): readonly TaskSummaryItem[] {
  if (selected === "all") {
    return items
  }
  const wantsDone = selected === "done"
  return items.filter((task) => (task.status === "done") === wantsDone)
}
