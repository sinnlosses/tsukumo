// 一覧の絞り込み（札と検索）と、見出しの件数の言い方。

import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import type { TaskBoardFilter, TaskStateView } from "./task-board-view.ts"
import type { TaskListCountItem } from "./task-list-count.ts"

export const FILTER_CHIPS = [
  { filter: "all", label: "すべて" },
  { filter: "ready", label: "着手できる" },
  { filter: "blocked", label: "待ち" },
  { filter: "hold", label: "保留" },
  { filter: "doing", label: "進行中" },
  { filter: "done", label: "完了" },
] satisfies readonly { readonly filter: TaskBoardFilter; readonly label: string }[]

/** 札の絞り込み。想定外の値はどの札にも属さず、「すべて」でだけ出る。 */
export function matchesFilter(state: TaskStateView, filter: TaskBoardFilter): boolean {
  return filter === "all" || filter === state.kind
}

/** 検索。ID・要約・本文の部分一致で、大文字小文字を区別しない。ID の形は決め打ちしない。 */
export function matchesQuery(task: TaskSummaryItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return (
    needle === "" ||
    task.id.toLowerCase().includes(needle) ||
    task.summary.toLowerCase().includes(needle) ||
    task.body.toLowerCase().includes(needle)
  )
}

export function countsTextOf(counts: readonly TaskListCountItem[]): string {
  return counts.map((item) => `${item.label} ${String(item.count)}`).join(" · ")
}
