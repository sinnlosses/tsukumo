// サイドバーの件数のチップで絞り込んだときに区画の一覧へ出す並び。**並びは変えない**
// （進行中はカード、未着手・完了はファイルの順の行。`domain/task-sidebar-order.ts` の仕事の
// 前段として、出す・出さないだけをここで決める。`task-list.tsx` が
// `filterTasksForSidebar` → `orderTasksForSidebar` の順に呼ぶ）。
//
// **想定外の status（todo / doing / done 以外）は3つのチップのどれにも属さない**ので、
// 絞っている間は出ない（「!」の印で出るのは何も選んでいない＝全件のときだけ。経緯は
// docs/display.md 4.2）。

import { type TaskSummaryItem } from "../../../../shared/task-summary.ts"
import { type TaskListFilterStatus } from "./task-list-count.ts"

/**
 * 選んだ状態のタスクだけを残す。**選んでいない（`undefined`）ときは全件をそのまま返す**
 * （チップを2回目に押すと全件へ戻る。`components/domain/sidebar/task-section.tsx` の state）。
 */
export function filterTasksForSidebar(
  items: readonly TaskSummaryItem[],
  selected: TaskListFilterStatus | undefined,
): readonly TaskSummaryItem[] {
  if (selected === undefined) {
    return items
  }
  return items.filter((task) => task.status === selected)
}
