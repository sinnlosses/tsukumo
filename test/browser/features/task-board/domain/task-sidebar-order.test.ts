import { describe, expect, it } from "bun:test"

import { orderTasksForSidebar } from "../../../../../src/browser/features/task-board/domain/task-sidebar-order.ts"
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

describe("orderTasksForSidebar", () => {
  it("doing だけを running にまとめ、残りはファイルの順のまま rest に残す", () => {
    const items = [
      taskOf("X-001", "done"),
      taskOf("X-002", "doing"),
      taskOf("X-003", "todo"),
      taskOf("X-004", "todo"),
    ]

    const result = orderTasksForSidebar(items)

    expect(result.running.map((task) => task.id)).toEqual(["X-002"])
    expect(result.rest.map((task) => task.id)).toEqual(["X-001", "X-003", "X-004"])
  })

  it("doing が複数あれば running に複数件、ファイルの順のまま並ぶ", () => {
    const items = [taskOf("X-001", "doing"), taskOf("X-002", "todo"), taskOf("X-003", "doing")]

    const result = orderTasksForSidebar(items)

    expect(result.running.map((task) => task.id)).toEqual(["X-001", "X-003"])
    expect(result.rest.map((task) => task.id)).toEqual(["X-002"])
  })

  it("doing が無ければ running は空で、rest はファイルの順のまま全件", () => {
    const items = [taskOf("X-001", "done"), taskOf("X-002", "todo"), taskOf("X-003", undefined)]

    const result = orderTasksForSidebar(items)

    expect(result.running).toEqual([])
    expect(result.rest.map((task) => task.id)).toEqual(["X-001", "X-002", "X-003"])
  })
})
