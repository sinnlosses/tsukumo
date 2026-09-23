import { describe, expect, it } from "bun:test"

import { filterTasksForSidebar } from "../../../../../src/browser/features/task-board/domain/task-sidebar-filter.ts"
import { type TaskSummaryItem } from "../../../../../src/shared/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

function taskOf(id: string, status: string | undefined): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status,
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
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
  it("選んでいない（undefined）ときは全件をそのまま返す", () => {
    expect(filterTasksForSidebar(TASKS, undefined)).toEqual(TASKS)
  })

  it("選んだ状態のタスクだけを残す", () => {
    expect(filterTasksForSidebar(TASKS, "todo").map((task) => task.id)).toEqual(["X-001", "X-004"])
  })

  it("進行中を選ぶと doing だけになる", () => {
    expect(filterTasksForSidebar(TASKS, "doing").map((task) => task.id)).toEqual(["X-002"])
  })

  it("想定外の status（todo / doing / done 以外）は3つのチップのどれを選んでも出ない", () => {
    expect(filterTasksForSidebar(TASKS, "todo")).not.toContainEqual(
      expect.objectContaining({ id: "X-005" }),
    )
    expect(filterTasksForSidebar(TASKS, "doing")).not.toContainEqual(
      expect.objectContaining({ id: "X-005" }),
    )
    expect(filterTasksForSidebar(TASKS, "done")).not.toContainEqual(
      expect.objectContaining({ id: "X-005" }),
    )
  })

  it("合う要素が無ければ空配列", () => {
    expect(filterTasksForSidebar([taskOf("X-001", "todo")], "done")).toEqual([])
  })
})
