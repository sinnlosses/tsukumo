import { describe, expect, it } from "vitest"

import { nextTaskCandidatesOf } from "../../../../src/browser/features/report/next-step.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../src/shared/repository/task-summary.ts"
import { taskStatusOfWord } from "../../../fixture/session-state.ts"

// すべて手で書いた架空のタスク一覧。

function task(
  id: string,
  status: string,
  overrides: Partial<TaskSummaryItem> = {},
): TaskSummaryItem {
  return {
    id,
    summary: `架空の${id}`,
    status: taskStatusOfWord(status),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: "sonnet",
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
    ...overrides,
  }
}

function known(items: readonly TaskSummaryItem[]): TaskSummaryResult {
  return { kind: "known", items, omittedClosedCount: 0 }
}

describe("nextTaskCandidatesOf", () => {
  it("着手できるタスクをおすすめの順に並べ、終えたタスクと着手できないタスクは入れない", () => {
    const tasks = known([
      task("X-001", "todo"),
      task("X-002", "todo", { urgency: "high" }),
      task("X-003", "todo"),
      task("X-004", "hold"),
    ])

    expect(nextTaskCandidatesOf(tasks, "X-003")).toEqual([
      { id: "X-002", summary: "架空のX-002" },
      { id: "X-001", summary: "架空のX-001" },
    ])
  })

  it("一覧が届いていなければ空", () => {
    expect(nextTaskCandidatesOf({ kind: "loading" }, "X-001")).toEqual([])
    expect(nextTaskCandidatesOf({ kind: "no-beads" }, "X-001")).toEqual([])
  })
})
