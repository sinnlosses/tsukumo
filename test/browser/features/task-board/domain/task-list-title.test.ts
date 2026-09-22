import { describe, expect, it } from "bun:test"

import { taskListTitle } from "../../../../../src/browser/features/task-board/domain/task-list-title.ts"
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

describe("taskListTitle", () => {
  it("tasks が undefined のときは件数を添えない", () => {
    expect(taskListTitle(undefined)).toBe("タスク一覧")
  })

  it("todo は常に添え、doing / done は 0 件でないときだけ添える", () => {
    expect(taskListTitle(TASKS)).toBe("タスク一覧 todo 1 / doing 1 / done 1")
  })

  it("doing が 0 件のときは doing を足さない", () => {
    const noDoing = TASKS.filter((task) => task.status !== "doing")
    expect(taskListTitle(noDoing)).toBe("タスク一覧 todo 1 / done 1")
  })
})
