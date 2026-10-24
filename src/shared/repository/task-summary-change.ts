// タスク一覧の差分（`tasks-changed` が運ぶ形）と、差分を作る・当てる関数。
// 全件は `hello` の `SessionState.tasks` が持ち、イベントは変わった課題と消えた ID だけを運ぶ。

import { isDeepEqual } from "remeda"

import type { TaskSummaryItem, TaskSummaryResult } from "./task-summary.ts"

/**
 * `tasks-changed` の中身。`known` 以外は {@link TaskSummaryResult} と同じ（一覧を持たない）。
 * `known` は前に知らせた一覧に当てる差分で、`order` は当てたあとの一覧の ID を読み元の順に並べたもの。
 */
export type TaskSummaryChange =
  | { readonly kind: "no-beads" }
  | { readonly kind: "loading" }
  | { readonly kind: "unknown" }
  | {
      readonly kind: "known"
      /** 増えた課題と、前と変わった課題（全文）。 */
      readonly upserted: readonly TaskSummaryItem[]
      readonly removed: readonly string[]
      readonly order: readonly string[]
      readonly omittedClosedCount: number
    }

/**
 * `previous`（前に知らせた一覧）から `next` になる差分。
 * `previous` が `known` でなければ、`next` の全件を `upserted` に入れる。
 */
export function diffTaskSummary(
  previous: TaskSummaryResult,
  next: TaskSummaryResult,
): TaskSummaryChange {
  if (next.kind !== "known") {
    return { kind: next.kind }
  }
  const previousById = new Map<string, TaskSummaryItem>(
    previous.kind === "known" ? previous.items.map((item) => [item.id, item]) : [],
  )
  const order = next.items.map((item) => item.id)
  const kept = new Set(order)
  return {
    kind: "known",
    upserted: next.items.filter((item) => !isDeepEqual(previousById.get(item.id), item)),
    removed: [...previousById.keys()].filter((id) => !kept.has(id)),
    order,
    omittedClosedCount: next.omittedClosedCount,
  }
}

/** `current` に `change` を当てた一覧。`known` 以外は一覧を持たない結果にそのまま置き換わる。 */
export function applyTaskSummaryChange(
  current: TaskSummaryResult,
  change: TaskSummaryChange,
): TaskSummaryResult {
  if (change.kind !== "known") {
    return { kind: change.kind }
  }
  const byId = new Map<string, TaskSummaryItem>(
    current.kind === "known" ? current.items.map((item) => [item.id, item]) : [],
  )
  for (const id of change.removed) {
    byId.delete(id)
  }
  for (const item of change.upserted) {
    byId.set(item.id, item)
  }
  const items: TaskSummaryItem[] = []
  for (const id of change.order) {
    const item = byId.get(id)
    if (item !== undefined) {
      items.push(item)
    }
  }
  return { kind: "known", items, omittedClosedCount: change.omittedClosedCount }
}
