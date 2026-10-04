// サイドバーの件数のチップで絞り込んだときに区画の一覧へ出す並び。
// 並びは変えず、`orderTasksForSidebar` の前段として出す・出さないだけをここで決める。
//
// 想定外の status（todo / doing / done 以外）は3つのチップのどれにも属さないので、「すべて」以外に絞っている間は出ない（「!」の印で出るのは全件のときだけ）。

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
  return items.filter((task) => task.status === selected)
}
