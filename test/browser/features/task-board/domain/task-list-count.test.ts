import { describe, expect, it } from "bun:test"

import { taskListCounts } from "../../../../../src/browser/features/task-board/domain/task-list-count.ts"
import { type TaskSummaryItem } from "../../../../../src/shared/task-summary.ts"

// フィクスチャはすべて手で書いた架空のタスク（実物の develop/tasks.json は使わない）。

const TASKS: readonly TaskSummaryItem[] = [
  {
    id: "X-001",
    summary: "架空のタスク1",
    status: "todo",
    difficulty: "sonnet",
    loopable: "Y",
    dependencies: [],
  },
  {
    id: "X-002",
    summary: "架空のタスク2",
    status: "done",
    difficulty: "haiku",
    loopable: "Y",
    dependencies: [],
  },
  {
    id: "X-003",
    summary: "架空のタスク3",
    status: undefined,
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
  },
  {
    id: "X-004",
    summary: "架空のタスク4",
    status: "doing",
    difficulty: "sonnet",
    loopable: "N",
    dependencies: [],
  },
]

describe("taskListCounts", () => {
  it("進行中 → 未着手 → 完了の順で件数を返す", () => {
    expect(taskListCounts(TASKS)).toEqual([
      { status: "doing", label: "進行中", count: 1 },
      { status: "todo", label: "未着手", count: 1 },
      { status: "done", label: "完了", count: 1 },
    ])
  })

  it("0件のものも省かず出す（チップの並びを動かさない）", () => {
    const noDoing = TASKS.filter((task) => task.status !== "doing")
    expect(taskListCounts(noDoing)).toEqual([
      { status: "doing", label: "進行中", count: 0 },
      { status: "todo", label: "未着手", count: 1 },
      { status: "done", label: "完了", count: 1 },
    ])
  })
})
