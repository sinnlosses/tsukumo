// サイドバーの一覧（`task-list.tsx`）に出す並び。進行中（doing）だけ先頭にまとめ、残りは
// develop/tasks.json のファイルの順のままにする（todo と done は混ざったままでよい。
// 経緯は docs/display.md 4.2）。

import { type TaskSummaryItem } from "../../../../shared/task-summary.ts"

export type TaskSidebarOrder = {
  /** 先頭に並べる進行中のタスク（ファイルの順のまま。2件以上あれば2枚以上のカードになる）。 */
  readonly running: readonly TaskSummaryItem[]
  /** 進行中を除いた残り。ファイルの順のまま（status ごとにまとめない）。 */
  readonly rest: readonly TaskSummaryItem[]
}

export function orderTasksForSidebar(items: readonly TaskSummaryItem[]): TaskSidebarOrder {
  const running = items.filter((task) => task.status === "doing")
  const rest = items.filter((task) => task.status !== "doing")
  return { running, rest }
}
