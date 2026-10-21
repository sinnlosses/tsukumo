import { describe, expect, it } from "vitest"

import { orderTasksForSidebar } from "../../../../../src/browser/features/task-board/domain/task-sidebar-order.ts"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"
import { taskStatusOfWord } from "../../../../fixture/session-state.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物のタスクファイルは使わない）。

function taskOf(id: string, status: string | undefined): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status: taskStatusOfWord(status),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: undefined,
    loopable: undefined,
    body: "",
    location: { kind: "none" },
  }
}

describe("orderTasksForSidebar", () => {
  it("doing が複数あれば running に複数件、ファイルの順のまま並ぶ", () => {
    const items = [taskOf("X-001", "doing"), taskOf("X-002", "todo"), taskOf("X-003", "doing")]

    const result = orderTasksForSidebar(items)

    expect(result.running.map((task) => task.id)).toEqual(["X-001", "X-003"])
    expect(result.rest.map((task) => task.id)).toEqual(["X-002"])
  })

  it("draft は先頭に出さず、ファイルの順のまま rest に入る", () => {
    const result = orderTasksForSidebar([taskOf("X-001", "draft"), taskOf("X-002", "todo")])

    expect(result.running).toEqual([])
    expect(result.rest.map((task) => task.id)).toEqual(["X-001", "X-002"])
  })
})
