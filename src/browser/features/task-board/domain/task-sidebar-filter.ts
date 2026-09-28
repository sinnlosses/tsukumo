// サイドバーの件数のチップで絞り込んだときに区画の一覧へ出す並び。
// 並びは変えず、`orderTasksForSidebar` の前段として出す・出さないだけをここで決める。
//
// 想定外の status（todo / doing / done 以外）は3つのチップのどれにも属さないので、絞っている間は出ない（「!」の印で出るのは全件のときだけ）。

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import type { TaskListFilterStatus } from "./task-list-count.ts"

/** 選んだ状態のタスクだけを残す。選んでいない（`undefined`）ときは全件をそのまま返す。 */
export function filterTasksForSidebar(
  items: readonly TaskSummaryItem[],
  selected: TaskListFilterStatus | undefined,
): readonly TaskSummaryItem[] {
  if (selected === undefined) {
    return items
  }
  return items.filter((task) => task.status === selected)
}
