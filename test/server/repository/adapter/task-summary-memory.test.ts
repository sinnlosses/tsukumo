import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  readTaskSummaryMemory,
  TASK_SUMMARY_MEMORY_LIMIT,
  writeTaskSummaryMemory,
} from "../../../../src/server/repository/adapter/task-summary-memory.ts"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const root = useTempDir("task-summary-memory")

function memoryPath(): string {
  return join(root(), "task-summary.json")
}

function item(id: string, overrides: Partial<TaskSummaryItem> = {}): TaskSummaryItem {
  return {
    id,
    summary: `${id} の要約`,
    status: "todo",
    dependencies: [],
    waitingFor: [],
    labels: [],
    body: "本文",
    location: { kind: "none" },
    ...overrides,
  }
}

describe("タスク一覧の記憶", () => {
  it("書いた一覧を、undefined の欄・ラベルも含めて同じ形で読み戻す", () => {
    const items = [
      item("t-1", {
        dependencies: ["t-2"],
        waitingFor: ["t-2"],
        labels: ["loopable:Y"],
      }),
      item("t-2", { location: { kind: "issue", url: "https://example.test/2" } }),
    ]

    writeTaskSummaryMemory("/work/a", items, memoryPath())

    expect(readTaskSummaryMemory("/work/a", memoryPath())).toStrictEqual(items)
  })

  it("作業ディレクトリごとに分けて持つ", () => {
    writeTaskSummaryMemory("/work/a", [item("t-1")], memoryPath())
    writeTaskSummaryMemory("/work/b", [item("t-2")], memoryPath())

    expect(readTaskSummaryMemory("/work/a", memoryPath())?.map((entry) => entry.id)).toStrictEqual([
      "t-1",
    ])
    expect(readTaskSummaryMemory("/work/c", memoryPath())).toBeUndefined()
  })

  it("同じ作業ディレクトリへ書き直すと置き換わる", () => {
    writeTaskSummaryMemory("/work/a", [item("t-1")], memoryPath())
    writeTaskSummaryMemory("/work/a", [item("t-9")], memoryPath())

    expect(readTaskSummaryMemory("/work/a", memoryPath())?.map((entry) => entry.id)).toStrictEqual([
      "t-9",
    ])
  })

  it("上限を超えたら古い作業ディレクトリから落とす", () => {
    for (let index = 0; index <= TASK_SUMMARY_MEMORY_LIMIT; index += 1) {
      writeTaskSummaryMemory(`/work/${index}`, [item("t-1")], memoryPath())
    }

    expect(readTaskSummaryMemory("/work/0", memoryPath())).toBeUndefined()
    expect(readTaskSummaryMemory("/work/1", memoryPath())).toBeDefined()
    expect(readTaskSummaryMemory(`/work/${TASK_SUMMARY_MEMORY_LIMIT}`, memoryPath())).toBeDefined()
  })

  it.each([
    ["ファイルが無い", undefined],
    ["壊れている", "{ not json"],
    ["版が違う", JSON.stringify({ v: 2, entries: [{ cwd: "/work/a", items: [] }] })],
    ["形が違う", JSON.stringify({ v: 3, entries: [{ cwd: "/work/a", items: [{ id: 1 }] }] })],
  ])("%sときは無いものとして扱う", (_name, content) => {
    if (content !== undefined) {
      writeFileSync(memoryPath(), content)
    }

    expect(readTaskSummaryMemory("/work/a", memoryPath())).toBeUndefined()
  })

  it("書けない置き場でも例外を投げない", () => {
    const blocked = join(root(), "blocked")
    writeFileSync(blocked, "ファイル")

    expect(() => {
      writeTaskSummaryMemory("/work/a", [item("t-1")], join(blocked, "task-summary.json"))
    }).not.toThrow()
  })
})
