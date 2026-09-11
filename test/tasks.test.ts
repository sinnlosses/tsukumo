import { describe, expect, it } from "bun:test"

import { readTaskSummaries } from "../src/tasks.ts"

// すべて手で書いた架空のタスク一覧。develop/tasks.json の実物は使わない。

describe("readTaskSummaries", () => {
  it("id・summary・status をファイルの順で取り出す", () => {
    const content = JSON.stringify([
      { id: "X-001", summary: "架空のサイドバー実装", status: "done" },
      { id: "X-002", summary: "架空のタスク一覧", status: "todo" },
    ])

    expect(readTaskSummaries(content)).toEqual([
      { id: "X-001", summary: "架空のサイドバー実装", status: "done" },
      { id: "X-002", summary: "架空のタスク一覧", status: "todo" },
    ])
  })

  it("summary が無い要素は task フィールドの先頭行で代用する", () => {
    const content = JSON.stringify([
      { id: "X-001", task: "架空のタスクの説明\n詳細はここから", status: "todo" },
    ])

    expect(readTaskSummaries(content)).toEqual([
      { id: "X-001", summary: "架空のタスクの説明", status: "todo" },
    ])
  })

  it("summary が空文字のときも task フィールドで代用する", () => {
    const content = JSON.stringify([{ id: "X-001", summary: "", task: "代用元の説明" }])

    expect(readTaskSummaries(content)).toEqual([
      { id: "X-001", summary: "代用元の説明", status: undefined },
    ])
  })

  it("summary も task も無い要素は読み飛ばす", () => {
    const content = JSON.stringify([
      { id: "X-001", status: "todo" },
      { id: "X-002", summary: "残る要素", status: "todo" },
    ])

    expect(readTaskSummaries(content)).toEqual([
      { id: "X-002", summary: "残る要素", status: "todo" },
    ])
  })

  it("id が文字列でない要素は読み飛ばす", () => {
    const content = JSON.stringify([
      { id: 42, summary: "架空", status: "todo" },
      { id: "X-002", summary: "残る要素", status: "todo" },
    ])

    expect(readTaskSummaries(content)).toEqual([
      { id: "X-002", summary: "残る要素", status: "todo" },
    ])
  })

  it("status が文字列でない・無いときは undefined にする", () => {
    const content = JSON.stringify([{ id: "X-001", summary: "架空", status: 42 }])

    expect(readTaskSummaries(content)).toEqual([
      { id: "X-001", summary: "架空", status: undefined },
    ])
  })

  it("JSON として不正、またはトップレベルが配列でないときは undefined を返す", () => {
    expect(readTaskSummaries("{not valid json")).toBeUndefined()
    expect(readTaskSummaries(JSON.stringify({ tasks: [] }))).toBeUndefined()
  })
})
