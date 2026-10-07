import { describe, expect, it } from "vitest"

import { orderTasksForSidebar } from "../../../../../src/browser/features/task-board/domain/task-sidebar-order.ts"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

function taskOf(id: string, status: string | undefined): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status,
    dependencies: [],
    waitingFor: [],
    assignee: undefined,
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
})
