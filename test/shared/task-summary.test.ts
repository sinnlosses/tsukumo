import { describe, expect, it } from "bun:test"

import {
  readTaskSummaries,
  taskReadiness,
  type TaskSummaryItem,
} from "../../src/shared/task-summary.ts"

// すべて手で書いた架空のタスク一覧。develop/tasks.json の実物は使わない。

describe("readTaskSummaries", () => {
  it("id・summary・status・difficulty・loopable・依存をファイルの順で取り出す", () => {
    const content = JSON.stringify([
      {
        id: "X-001",
        summary: "架空のサイドバー実装",
        status: "done",
        difficulty: "sonnet",
        loopable: "Y",
        dependencies: [],
      },
      {
        id: "X-002",
        summary: "架空のタスク一覧",
        status: "todo",
        difficulty: "opus",
        loopable: "N",
        dependencies: ["X-001"],
      },
    ])

    expect(readTaskSummaries(content)).toEqual([
      {
        id: "X-001",
        summary: "架空のサイドバー実装",
        status: "done",
        difficulty: "sonnet",
        loopable: "Y",
        dependencies: [],
      },
      {
        id: "X-002",
        summary: "架空のタスク一覧",
        status: "todo",
        difficulty: "opus",
        loopable: "N",
        dependencies: ["X-001"],
      },
    ])
  })

  it("summary が無い要素は task フィールドの先頭行で代用する", () => {
    const content = JSON.stringify([
      { id: "X-001", task: "架空のタスクの説明\n詳細はここから", status: "todo" },
    ])

    expect(readTaskSummaries(content)).toEqual([
      {
        id: "X-001",
        summary: "架空のタスクの説明",
        status: "todo",
        difficulty: undefined,
        loopable: undefined,
        dependencies: [],
      },
    ])
  })

  it("summary が空文字のときも task フィールドで代用する", () => {
    const content = JSON.stringify([{ id: "X-001", summary: "", task: "代用元の説明" }])

    expect(readTaskSummaries(content)).toEqual([
      {
        id: "X-001",
        summary: "代用元の説明",
        status: undefined,
        difficulty: undefined,
        loopable: undefined,
        dependencies: [],
      },
    ])
  })

  it("summary も task も無い要素は読み飛ばす", () => {
    const content = JSON.stringify([
      { id: "X-001", status: "todo" },
      { id: "X-002", summary: "残る要素", status: "todo" },
    ])

    expect(readTaskSummaries(content)?.map((task) => task.id)).toEqual(["X-002"])
  })

  it("id が文字列でない要素は読み飛ばす", () => {
    const content = JSON.stringify([
      { id: 42, summary: "架空", status: "todo" },
      { id: "X-002", summary: "残る要素", status: "todo" },
    ])

    expect(readTaskSummaries(content)?.map((task) => task.id)).toEqual(["X-002"])
  })

  it("status・difficulty・loopable が文字列でない・無いときは undefined にする", () => {
    const content = JSON.stringify([
      { id: "X-001", summary: "架空", status: 42, difficulty: [], loopable: false },
    ])

    expect(readTaskSummaries(content)?.[0]).toMatchObject({
      status: undefined,
      difficulty: undefined,
      loopable: undefined,
    })
  })

  it("依存が配列でない・文字列以外が混ざるときは文字列だけを残す", () => {
    const content = JSON.stringify([
      { id: "X-001", summary: "架空1", dependencies: "X-000" },
      { id: "X-002", summary: "架空2", dependencies: ["X-001", 42] },
    ])

    expect(readTaskSummaries(content)?.map((task) => task.dependencies)).toEqual([[], ["X-001"]])
  })

  it("JSON として不正、またはトップレベルが配列でないときは undefined を返す", () => {
    expect(readTaskSummaries("{not valid json")).toBeUndefined()
    expect(readTaskSummaries(JSON.stringify({ tasks: [] }))).toBeUndefined()
  })
})

describe("taskReadiness", () => {
  const item = (id: string, status: string, dependencies: readonly string[]): TaskSummaryItem => ({
    id,
    summary: `架空の${id}`,
    status,
    difficulty: undefined,
    loopable: undefined,
    dependencies,
  })

  const FINISHED = item("X-001", "done", [])
  const FREE = item("X-002", "todo", [])
  const AFTER_FINISHED = item("X-003", "todo", ["X-001"])
  const AFTER_UNFINISHED = item("X-004", "todo", ["X-002", "X-001"])
  const AFTER_ARCHIVED = item("X-005", "todo", ["X-900"])
  const TASKS: readonly TaskSummaryItem[] = [
    FINISHED,
    FREE,
    AFTER_FINISHED,
    AFTER_UNFINISHED,
    AFTER_ARCHIVED,
  ]

  it("todo 以外は判定しない", () => {
    expect(taskReadiness(FINISHED, TASKS)).toBeUndefined()
  })

  it("依存が無ければ着手できる", () => {
    expect(taskReadiness(FREE, TASKS)).toEqual({ kind: "ready" })
  })

  it("依存が done なら着手できる", () => {
    expect(taskReadiness(AFTER_FINISHED, TASKS)).toEqual({ kind: "ready" })
  })

  it("done でない依存があると、その ID を並べて止める", () => {
    expect(taskReadiness(AFTER_UNFINISHED, TASKS)).toEqual({
      kind: "blocked",
      blockedBy: ["X-002"],
    })
  })

  it("一覧に無い依存は止めない（アーカイブ済みは完了扱い）", () => {
    expect(taskReadiness(AFTER_ARCHIVED, TASKS)).toEqual({ kind: "ready" })
  })
})
