import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  watchTaskSummary,
  type TaskSummaryWatcher,
} from "../../../src/server/adapter/task-summary.ts"

// 実際のポーリング間隔（TASK_SUMMARY_POLL_INTERVAL_MS）を待つとテストが遅くなるので、
// テストだけ短い間隔に差し替える（`pollOnce` はこの間隔より少し長く待つ）。
const TEST_POLL_INTERVAL_MS = 10

let dir: string
let watcher: TaskSummaryWatcher | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-task-summary-"))
  mkdirSync(join(dir, "develop"), { recursive: true })
})

afterEach(() => {
  watcher?.close()
  watcher = undefined
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

function watch(onChange: (tasks: unknown) => void): TaskSummaryWatcher {
  const created = watchTaskSummary(dir, onChange, TEST_POLL_INTERVAL_MS)
  watcher = created
  return created
}

/** 通知されるはずの1件。**フィールドの一覧は shared 側の仕事**なので、ここでは1箇所にまとめて
 * 置き、この層が見ている「読み直したかどうか」だけがテストの主題であることを保つ。 */
function notified(id: string, summary: string, status: string): Record<string, unknown> {
  return { id, summary, status, difficulty: undefined, dependencies: [] }
}

function pollOnce(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, TEST_POLL_INTERVAL_MS * 3))
}

describe("watchTaskSummary", () => {
  it("develop/tasks.json が無いときは呼ばれない（既定の undefined のまま）", () => {
    const changes: unknown[] = []
    watch((tasks) => changes.push(tasks))

    expect(changes).toEqual([])
  })

  it("起こした時点で develop/tasks.json を読んで通知する", () => {
    writeTasks(JSON.stringify([{ id: "T-1", summary: "ダミーのタスク", status: "todo" }]), 0)
    const changes: unknown[] = []
    watch((tasks) => changes.push(tasks))

    expect(changes).toEqual([[notified("T-1", "ダミーのタスク", "todo")]])
  })

  it("mtime が変わらない間は読み直さず、通知もしない", async () => {
    writeTasks(JSON.stringify([{ id: "T-1", summary: "1つめ", status: "todo" }]), 0)
    const changes: unknown[] = []
    watch((tasks) => changes.push(tasks))
    expect(changes).toHaveLength(1)

    // ファイルの中身を直接書き換えても、mtime を同じ秒のまま保てば通知が増えない
    // （読み直しの判断が mtime だけを見ていることの確認）。
    writeTasks(JSON.stringify([{ id: "T-2", summary: "2つめ", status: "todo" }]), 0)
    await pollOnce()

    expect(changes).toHaveLength(1)
  })

  it("mtime が変わったら読み直して通知する", async () => {
    writeTasks(JSON.stringify([{ id: "T-1", summary: "1つめ", status: "todo" }]), 0)
    const changes: unknown[] = []
    watch((tasks) => changes.push(tasks))

    writeTasks(JSON.stringify([{ id: "T-2", summary: "2つめ", status: "in_progress" }]), 5)
    await pollOnce()

    expect(changes).toEqual([
      [notified("T-1", "1つめ", "todo")],
      [notified("T-2", "2つめ", "in_progress")],
    ])
  })

  it("ファイルが消えたら undefined を通知し、また現れたら追従する", async () => {
    writeTasks(JSON.stringify([{ id: "T-1", summary: "1つめ", status: "todo" }]), 0)
    const changes: unknown[] = []
    watch((tasks) => changes.push(tasks))

    rmSync(tasksPath())
    await pollOnce()

    writeTasks(JSON.stringify([{ id: "T-1", summary: "1つめ", status: "todo" }]), 5)
    await pollOnce()

    expect(changes).toEqual([
      [notified("T-1", "1つめ", "todo")],
      undefined,
      [notified("T-1", "1つめ", "todo")],
    ])
  })

  it("close するとそれ以降は通知しない", async () => {
    writeTasks(JSON.stringify([{ id: "T-1", summary: "1つめ", status: "todo" }]), 0)
    const changes: unknown[] = []
    watch((tasks) => changes.push(tasks)).close()

    writeTasks(JSON.stringify([{ id: "T-2", summary: "2つめ", status: "todo" }]), 5)
    await pollOnce()

    expect(changes).toHaveLength(1)
  })
})
