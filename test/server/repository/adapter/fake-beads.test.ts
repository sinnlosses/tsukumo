import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  FAKE_BEADS_ISSUES_PATH,
  readFakeBeadsIssues,
} from "../../../../src/server/repository/adapter/fake-beads.ts"
import {
  readTaskSummaryMemory,
  writeTaskSummaryMemory,
} from "../../../../src/server/repository/adapter/task-summary-memory.ts"
import {
  FAKE_TASK_SUMMARY_POLL_INTERVAL_MS,
  REAL_TASK_SUMMARY_PORTS,
  taskSummaryOptionsOf,
  watchTaskSummary,
  type TaskSummaryWatcher,
} from "../../../../src/server/repository/adapter/task-summary.ts"
import type { TaskSummaryResult } from "../../../../src/shared/repository/task-summary.ts"
import { writeProjectSettingsContent } from "../../../fixture/project-settings.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 疑似セッションの見張りは `bd` を起こさず、cwd のファイルの課題を出す。ふだんの見張りは今どおり `bd` を読む。
// 課題は架空のものだけにする。

/** 通知を待つ上限。疑似セッションの間隔の何周ぶんもとる。 */
const WAIT_LIMIT_MS = FAKE_TASK_SUMMARY_POLL_INTERVAL_MS * 10

const cwd = useTempDir("fake-beads")
let watcher: TaskSummaryWatcher | undefined

afterEach(async () => {
  await watcher?.close()
  watcher = undefined
})

describe("taskSummaryOptionsOf", () => {
  it("疑似セッションは課題の口だけを差し替え、設定の読み出しと時計は本物を使う", () => {
    const options = taskSummaryOptionsOf("fake")

    expect(options.intervalMs).toBe(FAKE_TASK_SUMMARY_POLL_INTERVAL_MS)
    expect(options.ports.readBeadsIssues).toBe(readFakeBeadsIssues)
    expect(options.ports.createBeadsStampReader).not.toBe(
      REAL_TASK_SUMMARY_PORTS.createBeadsStampReader,
    )
    expect(options.ports.readProjectSettings).toBe(REAL_TASK_SUMMARY_PORTS.readProjectSettings)
    expect(options.ports.clock).toBe(REAL_TASK_SUMMARY_PORTS.clock)
  })
})

describe("readFakeBeadsIssues", () => {
  it("ファイルが無いと failed（.beads が無いときと同じ「不明」）", async () => {
    expect(await readFakeBeadsIssues(cwd())).toEqual({ kind: "failed" })
  })

  it("JSON の配列でないと failed", async () => {
    writeFakeIssuesContent(cwd(), "{")

    expect(await readFakeBeadsIssues(cwd())).toEqual({ kind: "failed" })
  })

  it("bd list --json と同じ形の配列を課題として読む", async () => {
    writeFakeIssues(cwd(), [issue("t-01", "架空のタスク")])

    const outcome = await readFakeBeadsIssues(cwd())

    expect(outcome.kind === "issues" ? outcome.issues.map((read) => read.id) : []).toEqual(["t-01"])
  })
})

describe("疑似セッションの見張り", () => {
  it("見張りを起こしたあとに置いた課題が、疑似セッションの間隔で一覧に届く", async () => {
    const changes = watchFake(cwd())
    await waitUntil(() => changes.length > 0)
    writeFakeIssues(cwd(), [issue("t-01", "架空のタスク")])

    await waitUntil(() => changes.some((change) => change.kind === "known"))

    const last = changes.at(-1)
    expect(last?.kind === "known" ? last.items.map((item) => item.id) : []).toEqual(["t-01"])
  })

  it("設定は本物のファイルを読み、tasks: off なら課題を置いても「使わない」", async () => {
    writeProjectSettingsContent(cwd(), '{ "tasks": "off" }')
    writeFakeIssues(cwd(), [issue("t-01", "架空のタスク")])
    const changes = watchFake(cwd())

    await waitUntil(() => changes.length > 0)

    expect(changes).toEqual([{ kind: "off" }])
  })
})

function watchFake(dir: string): TaskSummaryResult[] {
  const changes: TaskSummaryResult[] = []
  const options = taskSummaryOptionsOf("fake")
  const memoryPath = join(dir, "task-summary-memory.json")
  watcher = watchTaskSummary(dir, (result) => changes.push(result), {
    ...options,
    ports: {
      ...options.ports,
      readTaskSummaryMemory: (memoryCwd) => readTaskSummaryMemory(memoryCwd, memoryPath),
      writeTaskSummaryMemory: (memoryCwd, items) => {
        writeTaskSummaryMemory(memoryCwd, items, memoryPath)
      },
    },
  })
  watcher.setWatching(true)
  return changes
}

/** `bd list --json` の1件の形の、架空の未着手の課題。 */
function issue(id: string, title: string): Readonly<Record<string, unknown>> {
  return { id, title, status: "open", created_at: "2026-01-14T00:00:00Z" }
}

function writeFakeIssues(dir: string, issues: readonly Readonly<Record<string, unknown>>[]): void {
  writeFakeIssuesContent(dir, JSON.stringify(issues))
}

function writeFakeIssuesContent(dir: string, content: string): void {
  const path = join(dir, FAKE_BEADS_ISSUES_PATH)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

async function waitUntil(done: () => boolean): Promise<void> {
  const deadline = performance.now() + WAIT_LIMIT_MS
  while (!done() && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, FAKE_TASK_SUMMARY_POLL_INTERVAL_MS / 4))
  }
}
