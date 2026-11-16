// サイドシートの分類の場面に並べるドラフトの札。一覧の順のまま、ドラフトの全件を札にする。

import type { TaskDifficulty, TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { codeSpanParts, type CodeSpanPart } from "../../../domain/code-span.ts"
import { choiceOf, type DraftSortChoice, type DraftSortState } from "./draft-sort.ts"
import { taskStateOf } from "./task-board-content.ts"
import type { TaskStateView } from "./task-board-view.ts"

export type DraftSortCard = {
  readonly id: string
  readonly state: TaskStateView
  readonly difficulty?: TaskDifficulty
  readonly summary: readonly CodeSpanPart[]
  /** 本文の頭。見出しと空行を除いた先頭の数行を1行に畳んだもの。無ければ空。 */
  readonly bodyHead: string
  readonly choice: DraftSortChoice
  /** 却下の理由（1行）。却下でない札でも持つ。 */
  readonly reason: string
}

const BODY_HEAD_LENGTH = 140

export function draftTasksOf(items: readonly TaskSummaryItem[]): readonly TaskSummaryItem[] {
  return items.filter((task) => taskStateOf(task).kind === "draft")
}

export function draftSortCardsOf(
  drafts: readonly TaskSummaryItem[],
  sort: DraftSortState,
): readonly DraftSortCard[] {
  return drafts.map((task) => ({
    id: task.id,
    state: taskStateOf(task),
    ...(task.difficulty === undefined ? {} : { difficulty: task.difficulty }),
    summary: codeSpanParts(task.summary),
    bodyHead: bodyHeadOf(task.body),
    choice: choiceOf(sort, task.id),
    reason: sort.reasons[task.id] ?? "",
  }))
}

function bodyHeadOf(body: string): string {
  const head = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .join(" ")
  return head.length > BODY_HEAD_LENGTH ? `${head.slice(0, BODY_HEAD_LENGTH)}…` : head
}
