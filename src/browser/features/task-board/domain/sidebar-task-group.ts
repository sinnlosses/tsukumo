// サイドバーのタスクの一覧の分け方。着手できる `todo` と、依存の済んでいない `todo`（待ち）の2群だけを出す。
// 進行中・保留・ドラフト・完了は出さない（全件はタスクの紙で見る）。

import { taskReadiness, type TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"

export type SidebarTaskGroups = {
  readonly ready: readonly TaskSummaryItem[]
  readonly waiting: readonly TaskSummaryItem[]
}

/** `excludedIds` のタスクは、どちらの群にも出さない（ほかの場所が同じタスクを出しているとき）。 */
export function sidebarTaskGroups(
  items: readonly TaskSummaryItem[],
  excludedIds: readonly string[],
): SidebarTaskGroups {
  const shown = items.filter((item) => !excludedIds.includes(item.id))
  return {
    ready: shown.filter((item) => taskReadiness(item)?.kind === "ready"),
    waiting: shown.filter((item) => taskReadiness(item)?.kind === "blocked"),
  }
}
