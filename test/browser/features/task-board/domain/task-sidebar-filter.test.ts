import { describe, expect, it } from "vitest"

import { filterTasksForSidebar } from "../../../../../src/browser/features/task-board/domain/task-sidebar-filter.ts"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物のタスクファイルは使わない）。

function taskOf(id: string, status: string | undefined): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status,
    dependencies: [],
    waitingFor: [],
    labels: [],
    body: "",
    location: { kind: "none" },
  }
}

const TASKS: readonly TaskSummaryItem[] = [
  taskOf("X-001", "todo"),
  taskOf("X-002", "doing"),
  taskOf("X-003", "done"),
  taskOf("X-004", "todo"),
  taskOf("X-005", "archived"),
]

describe("filterTasksForSidebar", () => {
  it("未完了と完了で全件を done かどうかで分け、想定外の status は未完了に入る", () => {
    expect(filterTasksForSidebar(TASKS, "open").map((task) => task.id)).toEqual([
      "X-001",
      "X-002",
      "X-004",
      "X-005",
    ])
    expect(filterTasksForSidebar(TASKS, "done").map((task) => task.id)).toEqual(["X-003"])
  })
})
