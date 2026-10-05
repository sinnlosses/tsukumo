import { describe, expect, it } from "vitest"

import { filterTasksForSidebar } from "../../../../../src/browser/features/task-board/domain/task-sidebar-filter.ts"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

function taskOf(id: string, status: string | undefined): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status,
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
    assignee: undefined,
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
  it("完了を選ぶと done だけになる（想定外の status は3つのチップのどれを選んでも出ない）", () => {
    expect(filterTasksForSidebar(TASKS, "done").map((task) => task.id)).toEqual(["X-003"])
  })
})
