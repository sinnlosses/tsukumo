import { rmSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import type { BeadsOutcome } from "../../../../src/server/repository/adapter/beads.ts"
import {
  readTaskSummaryMemory,
  writeTaskSummaryMemory,
} from "../../../../src/server/repository/adapter/task-summary-memory.ts"
import {
  REAL_TASK_SUMMARY_PORTS,
  watchTaskSummary,
  type TaskSummaryPorts,
  type TaskSummaryWatcher,
} from "../../../../src/server/repository/adapter/task-summary.ts"
import {
  DEFAULT_RUN_PROMPT,
  PROJECT_SETTINGS_PATH,
} from "../../../../src/shared/repository/project-settings.ts"
import { BEADS_TEST_ACTOR, bd, useBeadsHome } from "../../../fixture/beads-repository.ts"
import {
  writeProjectSettings,
  writeProjectSettingsContent,
} from "../../../fixture/project-settings.ts"
import {
  initBeadsIssues,
  initBeadsRepository,
  initRepository,
  openIssue,
} from "../../../fixture/task-summary-repository.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 本物の `bd` を、`HOME` を一時ディレクトリへ向けて起こす（`useBeadsHome`）。
// リポジトリは一時ディレクトリに毎回作り、中身は架空の課題だけにする。

// 実際のポーリング間隔（TASK_SUMMARY_POLL_INTERVAL_MS）を待つとテストが遅くなるので、
// テストだけ短い間隔に差し替える。
const TEST_POLL_INTERVAL_MS = 10

/** `bd` の見回りは1回が約0.2秒なので、通知を待つ上限を長くとる。 */
const WAIT_LIMIT_MS = 15_000

/** 「通知が来ない」ことを確かめるとき、変えたあとに終わりを待つ見回りの回数（動いていた1回を除く）。 */
const QUIET_POLLS = 2

const root = useTempDir("task-summary")
const home = useBeadsHome(() => join(root(), "home"))
let watcher: TaskSummaryWatcher | undefined
let pollsFinished = 0

afterEach(async () => {
  pollsFinished = 0
  await watcher?.close()
  watcher = undefined
})

function watch(cwd: string, changes: unknown[]): void {
  watcher = watchTaskSummary(cwd, (tasks) => changes.push(tasks), {
    intervalMs: TEST_POLL_INTERVAL_MS,
    ports: testPorts(),
  })
  watcher.setWatching(true)
}

/** 本物の口のうち、覚える口だけを一時ディレクトリへ向ける（利用者のホームへ書かない）。 */
function testPorts(): TaskSummaryPorts {
  const memoryPath = join(root(), "task-summary.json")
  return {
    ...REAL_TASK_SUMMARY_PORTS,
    clock: {
      after: (delayMs, wake) => {
        pollsFinished += 1
        return REAL_TASK_SUMMARY_PORTS.clock.after(delayMs, wake)
      },
    },
    readTaskSummaryMemory: (cwd) => readTaskSummaryMemory(cwd, memoryPath),
    writeTaskSummaryMemory: (cwd, items) => {
      writeTaskSummaryMemory(cwd, items, memoryPath)
    },
  }
}

/** 通知が `count` 件に達するまで待つ（超えたら、そこまでの通知のまま期待値との比較で落ちる）。 */
async function waitForChanges(changes: readonly unknown[], count: number): Promise<void> {
  const deadline = performance.now() + WAIT_LIMIT_MS
  while (changes.length < count && performance.now() < deadline) {
    await sleep(TEST_POLL_INTERVAL_MS)
  }
}

/** 変えたあとに見回りが `QUIET_POLLS` 回終わるまで待つ（その間に通知が来たかは期待値で確かめる）。 */
async function waitForQuietPolls(): Promise<void> {
  const target = pollsFinishedCount() + QUIET_POLLS
  const deadline = performance.now() + WAIT_LIMIT_MS
  while (pollsFinishedCount() < target && performance.now() < deadline) {
    await sleep(TEST_POLL_INTERVAL_MS)
  }
}

function pollsFinishedCount(): number {
  return pollsFinished
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** `TaskSummaryResult` の `known` 側を組み立てる。 */
function known(...items: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { kind: "known", items, runPrompt: DEFAULT_RUN_PROMPT }
}

/** 何も付けずに作った未着手の課題1件の要約。 */
function plainTodo(id: string, summary: string): Record<string, unknown> {
  return {
    id,
    summary,
    status: "todo",
    dependencies: [],
    waitingFor: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  }
}

describe("watchTaskSummary", () => {
  it(
    "bd の課題を ID のまま作った時刻の順に出し、状態を読み替えて担当を添える。ラベルは読まない",
    { timeout: 60_000 },
    async () => {
      const repository = await initBeadsRepository(root(), [
        openIssue("t-010", "未着手", {
          labels: ["difficulty:opus"],
          created_at: "2026-01-13T00:00:00Z",
        }),
        openIssue("t-002", "保留", { status: "deferred" }),
        openIssue("t-003", "着手中", {
          status: "in_progress",
          assignee: BEADS_TEST_ACTOR,
          dependencies: [{ issue_id: "t-003", depends_on_id: "t-010", type: "blocks" }],
        }),
        openIssue("t-001", "済み", { status: "closed", closed_at: "2026-01-14T12:00:00Z" }),
      ])
      const changes: unknown[] = []
      watch(repository, changes)
      await waitForChanges(changes, 1)

      expect(changes).toEqual([
        known(
          plainTodo("t-010", "未着手"),
          { ...plainTodo("t-001", "済み"), status: "done" },
          { ...plainTodo("t-002", "保留"), status: "hold" },
          {
            ...plainTodo("t-003", "着手中"),
            status: "doing",
            dependencies: ["t-010"],
            waitingFor: ["t-010"],
            assignee: "wt-test",
          },
        ),
      ])
    },
  )

  it(
    "main を動かさずに bd で閉じると、次の見回りで done に変わる",
    { timeout: 60_000 },
    async () => {
      const repository = await initBeadsRepository(root(), [openIssue("t-001", "閉じる前")])
      const changes: unknown[] = []
      watch(repository, changes)
      await waitForChanges(changes, 1)

      await bd(repository, home(), "close", "t-001")
      await waitForChanges(changes, 2)

      expect(changes).toEqual([
        known(plainTodo("t-001", "閉じる前")),
        known({ ...plainTodo("t-001", "閉じる前"), status: "done" }),
      ])
    },
  )

  it(
    "設定が無くても .beads があれば一覧を出し、設定を足す・消すでは通知を重ねず、壊れたら「設定が読めない」を通知する",
    { timeout: 60_000 },
    async () => {
      const repository = await initBeadsIssues(root(), [openIssue("t-001", "架空")])
      const changes: unknown[] = []
      watch(repository, changes)
      await waitForChanges(changes, 1)

      writeProjectSettings(repository)
      await waitForQuietPolls()
      rmSync(join(repository, PROJECT_SETTINGS_PATH))
      await waitForQuietPolls()
      writeProjectSettingsContent(repository, '{ "tasks": { "mainBranch": ')
      await waitForChanges(changes, 2)

      expect(changes).toEqual([known(plainTodo("t-001", "架空")), { kind: "settings-invalid" }])
    },
  )

  it(".beads が無ければ、初回に「不明」を1回だけ通知し、設定を足しても重ねて通知しない", async () => {
    const repository = await initRepository(root())
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)
    writeProjectSettings(repository)
    await waitForQuietPolls()

    expect(changes).toEqual([{ kind: "unknown" }])
  })

  it("初回の読みがタイムアウトしたら「不明」を知らせ、次に読めたら一覧を知らせる", async () => {
    const repository = await initRepository(root())
    const outcomes: BeadsOutcome[] = [{ kind: "timed-out" }, { kind: "issues", issues: [] }]
    const changes: unknown[] = []
    watcher = watchTaskSummary(repository, (tasks) => changes.push(tasks), {
      intervalMs: TEST_POLL_INTERVAL_MS,
      ports: {
        ...testPorts(),
        readBeadsIssues: () => Promise.resolve(outcomes.shift() ?? { kind: "timed-out" }),
        createBeadsStampReader: () => () => Promise.resolve(undefined),
      },
    })
    watcher.setWatching(true)
    await waitForChanges(changes, 2)

    expect(changes).toEqual([{ kind: "unknown" }, known()])
  })
})
