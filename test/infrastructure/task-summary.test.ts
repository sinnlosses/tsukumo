import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createTaskSummaryReader } from "../../src/infrastructure/task-summary.ts"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-task-summary-"))
  mkdirSync(join(dir, "develop"), { recursive: true })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function tasksPath(): string {
  return join(dir, "develop", "tasks.json")
}

// 秒より細かい精度（ファイルシステム・`Date` 双方の丸め）に振り回されないよう、
// mtime は常に明示的に秒単位で指定する（自然な書き込み時刻には頼らない）。
function writeTasks(content: string, mtimeSecondsFromEpoch: number): void {
  writeFileSync(tasksPath(), content)
  const time = new Date(mtimeSecondsFromEpoch * 1000)
  utimesSync(tasksPath(), time, time)
}

describe("createTaskSummaryReader", () => {
  it("develop/tasks.json が無いときは undefined", () => {
    const read = createTaskSummaryReader(dir)

    expect(read()).toBeUndefined()
  })

  it("develop/tasks.json を読んで要約にする", () => {
    writeTasks(JSON.stringify([{ id: "T-1", summary: "ダミーのタスク", status: "todo" }]), 0)
    const read = createTaskSummaryReader(dir)

    expect(read()).toEqual([{ id: "T-1", summary: "ダミーのタスク", status: "todo" }])
  })

  it("mtime が変わらない間は読み直さず、同じ結果をキャッシュから返す", () => {
    writeTasks(JSON.stringify([{ id: "T-1", summary: "1つめ", status: "todo" }]), 0)
    const read = createTaskSummaryReader(dir)

    const first = read()
    // ファイルの中身を直接書き換えても、mtime を同じ秒のまま保てば反映されない
    // （読み直しの判断が mtime だけを見ていることの確認）。
    writeTasks(JSON.stringify([{ id: "T-2", summary: "2つめ", status: "todo" }]), 0)

    expect(read()).toEqual(first)
  })

  it("mtime が変わったら読み直す", () => {
    writeTasks(JSON.stringify([{ id: "T-1", summary: "1つめ", status: "todo" }]), 0)
    const read = createTaskSummaryReader(dir)

    expect(read()).toEqual([{ id: "T-1", summary: "1つめ", status: "todo" }])

    writeTasks(JSON.stringify([{ id: "T-2", summary: "2つめ", status: "in_progress" }]), 5)

    expect(read()).toEqual([{ id: "T-2", summary: "2つめ", status: "in_progress" }])
  })

  it("ファイルが消えたらキャッシュを捨てて undefined に落ち、また現れたら追従する", () => {
    writeTasks(JSON.stringify([{ id: "T-1", summary: "1つめ", status: "todo" }]), 0)
    const read = createTaskSummaryReader(dir)

    expect(read()).toEqual([{ id: "T-1", summary: "1つめ", status: "todo" }])

    rmSync(tasksPath())
    expect(read()).toBeUndefined()

    writeTasks(JSON.stringify([{ id: "T-1", summary: "1つめ", status: "todo" }]), 5)
    expect(read()).toEqual([{ id: "T-1", summary: "1つめ", status: "todo" }])
  })
})
