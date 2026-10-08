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
  it("渡した順に依らず、閉じた時刻の順に足していって刻みに届いたタスクを返す", () => {
    const items = [
      { id: "t-1", closedAtEpochMilliseconds: 200 },
      { id: "t-9", closedAtEpochMilliseconds: 100 },
    ]

    expect(taskMilestoneOf(items, 248)).toEqual({ count: 250, taskId: "t-1" })
  })

  it("刻みに届かなければ undefined", () => {
    const items = [{ id: "t-1", closedAtEpochMilliseconds: 100 }]

    expect(taskMilestoneOf(items, 100)).toBeUndefined()
  })

  it("1日に複数の刻みをまたいだら、最後にまたいだものだけ返す", () => {
    const items = Array.from({ length: 260 }, (_, index) => ({
      id: `t-${String(index + 1)}`,
      closedAtEpochMilliseconds: index,
    }))

    expect(taskMilestoneOf(items, 248)).toEqual({ count: 500, taskId: "t-252" })
  })
})
