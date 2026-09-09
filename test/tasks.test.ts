import { describe, expect, it } from "bun:test"

import { countTaskStatuses } from "../src/tasks.ts"

// すべて手で書いた架空のタスク一覧。develop/tasks.json の実物は使わない。

describe("countTaskStatuses", () => {
  it("status が done / todo の件数を数える", () => {
    const content = JSON.stringify([
      { id: "X-001", status: "done" },
      { id: "X-002", status: "todo" },
      { id: "X-003", status: "todo" },
    ])

    expect(countTaskStatuses(content)).toEqual({ done: 1, todo: 2 })
  })

  it("done / todo 以外の status（架空の値）は数えない", () => {
    const content = JSON.stringify([
      { id: "X-001", status: "done" },
      { id: "X-002", status: "blocked" },
    ])

    expect(countTaskStatuses(content)).toEqual({ done: 1, todo: 0 })
  })

  it("空配列のときは両方0件", () => {
    expect(countTaskStatuses("[]")).toEqual({ done: 0, todo: 0 })
  })

  it("要素がオブジェクトでない・status が文字列でないときは、その要素だけ数えない", () => {
    const content = JSON.stringify([
      { id: "X-001", status: "done" },
      "文字列の要素",
      { id: "X-002", status: 42 },
      { id: "X-003" },
    ])

    expect(countTaskStatuses(content)).toEqual({ done: 1, todo: 0 })
  })

  it("JSON として不正なときは undefined を返す", () => {
    expect(countTaskStatuses("{not valid json")).toBeUndefined()
  })

  it("トップレベルが配列でないときは undefined を返す", () => {
    expect(countTaskStatuses(JSON.stringify({ tasks: [] }))).toBeUndefined()
  })
})
