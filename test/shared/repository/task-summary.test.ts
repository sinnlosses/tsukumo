import { describe, expect, it } from "vitest"

import { taskReadiness, type TaskSummaryItem } from "../../../src/shared/repository/task-summary.ts"

// すべて手で書いた架空のタスク一覧。

describe("taskReadiness", () => {
  const item = (id: string, status: string, waitingFor: readonly string[]): TaskSummaryItem => ({
    id,
    summary: `架空の${id}`,
    status,
    dependencies: waitingFor,
    waitingFor,
    labels: [],
    body: "",
    location: { kind: "none" },
  })

  it("todo 以外は判定しない", () => {
    expect(taskReadiness(item("X-001", "hold", []))).toBeUndefined()
  })

  it("済んでいない依存が無ければ着手できる", () => {
    expect(taskReadiness(item("X-002", "todo", []))).toEqual({ kind: "ready" })
  })

  it("済んでいない依存があると、その ID を並べて止める", () => {
    expect(taskReadiness(item("X-003", "todo", ["X-002", "X-001"]))).toEqual({
      kind: "blocked",
      blockedBy: ["X-002", "X-001"],
    })
  })
})
