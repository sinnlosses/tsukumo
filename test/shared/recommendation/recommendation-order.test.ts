import { describe, expect, it } from "vitest"

import { recommendationOrder } from "../../../src/shared/recommendation/recommendation-order.ts"
import type { TaskSummaryItem } from "../../../src/shared/repository/task-summary.ts"
import { taskStatusOfWord } from "../../fixture/session-state.ts"

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

/** `id` を待っているタスク。 */
function waiter(id: string, status: string, waitingFor: string): TaskSummaryItem {
  return task(id, status, { dependencies: [waitingFor], waitingFor: [waitingFor] })
}

function idsOf(items: readonly TaskSummaryItem[]): readonly string[] {
  return recommendationOrder(items).map((entry) => entry.task.id)
}

describe("recommendationOrder", () => {
  it("着手できる未着手だけを並べる（済み・保留・着手中・依存待ちは入らない）", () => {
    const items = [
      task("X-001", "done"),
      task("X-002", "hold"),
      task("X-003", "doing"),
      task("X-004", "todo"),
      waiter("X-005", "todo", "X-004"),
    ]

    expect(idsOf(items)).toEqual(["X-004"])
  })

  it("ほかが同じなら、新しく登録されたもの（一覧の後ろ）が先", () => {
    expect(idsOf([task("X-001", "todo"), task("X-002", "todo"), task("X-003", "todo")])).toEqual([
      "X-003",
      "X-002",
      "X-001",
    ])
  })

  it("難しさの軽いものが、新しいものより先。難しさの無いものは sonnet と同じに扱う", () => {
    const items = [
      task("X-001", "todo", { difficulty: "haiku" }),
      task("X-002", "todo", { difficulty: undefined }),
      task("X-003", "todo", { difficulty: "opus" }),
      task("X-004", "todo", { difficulty: "sonnet" }),
    ]

    expect(idsOf(items)).toEqual(["X-001", "X-004", "X-002", "X-003"])
  })

  it("待っているタスクの多いものが、難しさの軽いものより先", () => {
    const items = [
      task("X-001", "todo", { difficulty: "opus" }),
      task("X-002", "todo", { difficulty: "haiku" }),
      waiter("X-003", "todo", "X-001"),
    ]

    expect(recommendationOrder(items)).toEqual([
      { task: items[0], waitedBy: ["X-003"] },
      { task: items[1], waitedBy: [] },
    ])
  })

  it("待っているタスクには、着手前と着手中だけを数える（保留・ドラフト・済みは数えない）", () => {
    const items = [
      task("X-001", "todo"),
      task("X-002", "todo"),
      waiter("X-003", "hold", "X-001"),
      waiter("X-004", "draft", "X-001"),
      task("X-005", "done", { dependencies: ["X-001"] }),
      waiter("X-006", "doing", "X-002"),
    ]

    expect(recommendationOrder(items).map((entry) => [entry.task.id, entry.waitedBy])).toEqual([
      ["X-002", ["X-006"]],
      ["X-001", []],
    ])
  })

  it("重要度の高いものが、待っているタスクの多いものより先。低いものは末尾", () => {
    const items = [
      task("X-001", "todo"),
      task("X-002", "todo", { importance: "high" }),
      task("X-003", "todo", { importance: "low" }),
      waiter("X-004", "todo", "X-001"),
      waiter("X-005", "todo", "X-003"),
    ]

    expect(idsOf(items)).toEqual(["X-002", "X-001", "X-003"])
  })

  it("緊急度の高いものが、重要度の高いものより先", () => {
    const items = [
      task("X-001", "todo", { importance: "high" }),
      task("X-002", "todo", { urgency: "high" }),
      task("X-003", "todo", { urgency: "low", importance: "high" }),
    ]

    expect(idsOf(items)).toEqual(["X-002", "X-001", "X-003"])
  })
})
