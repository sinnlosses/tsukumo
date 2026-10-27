import { describe, expect, it } from "vitest"

import {
  matchesFilter,
  matchesQuery,
} from "../../../../../src/browser/features/task-board/domain/task-board-filter.ts"
import type { TaskStateView } from "../../../../../src/browser/features/task-board/domain/task-board-view.ts"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"
import { taskStatusOfWord } from "../../../../fixture/session-state.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物のタスクファイルは使わない）。

function taskOf(overrides: Partial<TaskSummaryItem>): TaskSummaryItem {
  return {
    id: "X-001",
    summary: "要約",
    status: taskStatusOfWord("todo"),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    body: "",
    location: { kind: "none" },
    ...overrides,
  }
}

describe("matchesFilter", () => {
  const doing: TaskStateView = { kind: "doing", text: "進行中" }
  const other: TaskStateView = { kind: "other", text: "archived" }

  it("「すべて」はどの状態でも当たる", () => {
    expect(matchesFilter(doing, "all")).toBe(true)
    expect(matchesFilter(other, "all")).toBe(true)
  })

  it("札は同じ種類の状態にだけ当たる", () => {
    expect(matchesFilter(doing, "doing")).toBe(true)
    expect(matchesFilter(doing, "done")).toBe(false)
  })

  it("ドラフトの札はドラフトにだけ当たる", () => {
    const draft: TaskStateView = { kind: "draft", text: "ドラフト" }
    expect(matchesFilter(draft, "draft")).toBe(true)
    expect(matchesFilter(draft, "hold")).toBe(false)
    expect(matchesFilter({ kind: "hold", text: "保留" }, "draft")).toBe(false)
  })

  it("想定外の値はどの札にも属さない", () => {
    expect(matchesFilter(other, "done")).toBe(false)
  })
})

describe("matchesQuery", () => {
  const task = taskOf({ id: "X-007", summary: "Alpha の要約", body: "本文の Beta" })

  it("空の検索（空白だけも）は全件に当たる", () => {
    expect(matchesQuery(task, "")).toBe(true)
    expect(matchesQuery(task, "  ")).toBe(true)
  })

  it("ID・要約・本文の部分一致で、大文字小文字を区別しない", () => {
    expect(matchesQuery(task, "x-007")).toBe(true)
    expect(matchesQuery(task, "alpha")).toBe(true)
    expect(matchesQuery(task, "BETA")).toBe(true)
    expect(matchesQuery(task, "gamma")).toBe(false)
  })
})
