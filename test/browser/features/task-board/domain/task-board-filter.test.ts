import { describe, expect, it } from "vitest"

import {
  countsTextOf,
  matchesFilter,
  matchesQuery,
} from "../../../../../src/browser/features/task-board/domain/task-board-filter.ts"
import type { TaskStateView } from "../../../../../src/browser/features/task-board/domain/task-board-view.ts"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

function taskOf(overrides: Partial<TaskSummaryItem>): TaskSummaryItem {
  return {
    id: "X-001",
    summary: "要約",
    status: "todo",
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
    waitingFor: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
    ...overrides,
  }
}

describe("matchesFilter", () => {
  const doing: TaskStateView = { kind: "doing", text: "進行中" }
  const dropped: TaskStateView = { kind: "dropped", text: "取り下げ" }

  it("「すべて」はどの状態でも当たる", () => {
    expect(matchesFilter(doing, "all")).toBe(true)
    expect(matchesFilter(dropped, "all")).toBe(true)
  })

  it("札は同じ種類の状態にだけ当たる", () => {
    expect(matchesFilter(doing, "doing")).toBe(true)
    expect(matchesFilter(doing, "done")).toBe(false)
  })

  it("取り下げはどの札にも属さない", () => {
    expect(matchesFilter(dropped, "done")).toBe(false)
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

describe("countsTextOf", () => {
  it("件数を「ラベル 数」で ・ でつなぐ", () => {
    expect(
      countsTextOf([
        { status: "doing", label: "進行中", count: 2 },
        { status: "todo", label: "未着手", count: 19 },
      ]),
    ).toBe("進行中 2 · 未着手 19")
  })
})
