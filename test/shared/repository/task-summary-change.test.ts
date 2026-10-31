import { isDeepEqual } from "remeda"
import { describe, expect, it } from "vitest"

import {
  applyTaskSummaryChange,
  diffTaskSummary,
} from "../../../src/shared/repository/task-summary-change.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../src/shared/repository/task-summary.ts"
import { taskStatusOfWord } from "../../fixture/session-state.ts"

// すべて手で書いた架空のタスク一覧。

const item = (id: string, summary = `架空の${id}`): TaskSummaryItem => ({
  id,
  summary,
  status: taskStatusOfWord("todo"),
  dependencies: [],
  waitingFor: [],
  labels: [],
  difficulty: undefined,
  loopable: undefined,
  importance: "normal",
  urgency: "normal",
  body: "",
  location: { kind: "none" },
})

const known = (...items: readonly TaskSummaryItem[]): TaskSummaryResult => ({
  kind: "known",
  items,
  omittedClosedCount: 0,
})

describe("diffTaskSummary", () => {
  it("1件だけ変わると、その1件だけを運ぶ", () => {
    const change = diffTaskSummary(
      known(item("X-001"), item("X-002")),
      known(item("X-001"), item("X-002", "直した")),
    )
    expect(change).toEqual({
      kind: "known",
      upserted: [item("X-002", "直した")],
      removed: [],
      order: ["X-001", "X-002"],
      omittedClosedCount: 0,
    })
  })

  it("消えた課題の ID を removed に入れる", () => {
    const change = diffTaskSummary(known(item("X-001"), item("X-002")), known(item("X-002")))
    expect(change).toMatchObject({ kind: "known", upserted: [], removed: ["X-001"] })
  })

  it("初回と、一覧の無い状態からの復帰は全件を運ぶ", () => {
    for (const previous of [{ kind: "loading" }, { kind: "unknown" }] as const) {
      const change = diffTaskSummary(previous, known(item("X-001"), item("X-002")))
      expect(change).toMatchObject({ upserted: [item("X-001"), item("X-002")], removed: [] })
    }
  })

  it("一覧を持たない結果はそのまま運ぶ", () => {
    expect(diffTaskSummary(known(item("X-001")), { kind: "unknown" })).toEqual({
      kind: "unknown",
    })
  })
})

describe("applyTaskSummaryChange", () => {
  it("差分を当てた一覧は、全件を運んだときと同じになる", () => {
    const sequence: readonly TaskSummaryResult[] = [
      { kind: "loading" },
      known(item("X-001"), item("X-002"), item("X-003")),
      known(item("X-001"), item("X-002", "直した"), item("X-003")),
      known(item("X-002", "直した"), item("X-003"), item("X-004")),
      { kind: "unknown" },
      known(item("X-004"), item("X-002", "直した")),
    ]
    let delivered: TaskSummaryResult = { kind: "loading" }
    let applied: TaskSummaryResult = { kind: "loading" }
    for (const next of sequence) {
      applied = applyTaskSummaryChange(applied, diffTaskSummary(delivered, next))
      delivered = next
      expect(isDeepEqual(applied, next)).toBe(true)
    }
  })
})
