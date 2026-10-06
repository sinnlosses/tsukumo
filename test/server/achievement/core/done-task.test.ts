import { describe, expect, it } from "vitest"

import {
  doneTasksSince,
  taskMilestoneOf,
} from "../../../../src/server/achievement/core/done-task.ts"

describe("doneTasksSince", () => {
  it("前の日には無かった ID だけを返す", () => {
    const today = new Map([
      ["T-001", "既に終わっていた"],
      ["T-002", "今日終わった"],
    ])
    const yesterday = new Map([["T-001", "既に終わっていた"]])

    expect(doneTasksSince(today, yesterday)).toEqual([{ id: "T-002", summary: "今日終わった" }])
  })

  it("前の日が空集合なら全件が差分になる（リポジトリの最初の日）", () => {
    const today = new Map([["T-001", "最初の完了"]])

    expect(doneTasksSince(today, new Map())).toEqual([{ id: "T-001", summary: "最初の完了" }])
  })

  it("差分が無ければ空の並び", () => {
    const today = new Map([["T-001", "同じ"]])
    const yesterday = new Map([["T-001", "同じ"]])

    expect(doneTasksSince(today, yesterday)).toEqual([])
  })
})

describe("taskMilestoneOf", () => {
  it("ID の順に足していって刻みに届いたタスクを返す", () => {
    const items = [
      { id: "T-102", summary: "b" },
      { id: "T-101", summary: "a" },
    ]

    expect(taskMilestoneOf(items, 248)).toEqual({ kind: "task", count: 250, taskId: "T-102" })
  })

  it("刻みに届かなければ undefined", () => {
    const items = [{ id: "T-001", summary: "a" }]

    expect(taskMilestoneOf(items, 100)).toBeUndefined()
  })

  it("GH-<n> の ID も番号順に足す（T-xxx と混ざっても数で並ぶ）", () => {
    const items = [
      { id: "GH-102", summary: "b" },
      { id: "T-101", summary: "a" },
    ]

    expect(taskMilestoneOf(items, 248)).toEqual({ kind: "task", count: 250, taskId: "GH-102" })
  })

  it("1日に複数の刻みをまたいだら、最後にまたいだものだけ返す", () => {
    // 250件ぶんの刻みを2回またぐには、少なくとも250件超のタスクが同じ日に終わる必要がある
    // （現実的には稀だが、ロジックが「あとから見つかったほうを残す」ことを確かめる）。
    const items = Array.from({ length: 260 }, (_, index) => ({
      id: `T-${String(index + 1).padStart(3, "0")}`,
      summary: "x",
    }))

    expect(taskMilestoneOf(items, 248)).toEqual({ kind: "task", count: 500, taskId: "T-252" })
  })
})
