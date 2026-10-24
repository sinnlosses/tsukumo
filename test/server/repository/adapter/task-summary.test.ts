import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  beadsOutcomeOf,
  type BeadsOutcome,
} from "../../../../src/server/repository/adapter/beads.ts"
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
import { openIssue } from "../../../fixture/task-summary-repository.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 実際のポーリング間隔（TASK_SUMMARY_POLL_INTERVAL_MS）を待つとテストが遅くなるので、
// テストだけ短い間隔に差し替える。
const TEST_POLL_INTERVAL_MS = 10

/** 負荷で見回りが遅れても落ちないよう、通知を待つ上限を長くとる。 */
const WAIT_LIMIT_MS = 15_000

/** 「通知が来ない」ことを確かめるとき、変えたあとに終わりを待つ見回りの回数（動いていた1回を除く）。 */
const QUIET_POLLS = 2

const root = useTempDir("task-summary")
let watcher: TaskSummaryWatcher | undefined
let pollsFinished = 0

afterEach(async () => {
  pollsFinished = 0
  await watcher?.close()
  watcher = undefined
})

function watch(cwd: string, changes: unknown[], ports: Partial<TaskSummaryPorts>): void {
  watcher = watchTaskSummary(cwd, (tasks) => changes.push(tasks), {
    intervalMs: TEST_POLL_INTERVAL_MS,
    ports: { ...testPorts(), ...ports },
  })
  watcher.setWatching(true)
}

/**
 * 取り込み口（`bd list`・印）のフェイク。`replaceIssues` で課題を替えると印も進み、次の見回りで読み直される。
 */
function fakeIntake(initial: readonly Readonly<Record<string, unknown>>[]): {
  readonly ports: Partial<TaskSummaryPorts>
  readonly replaceIssues: (issues: readonly Readonly<Record<string, unknown>>[]) => void
} {
  let issues = initial
  let revision = 0
  return {
    ports: {
      readBeadsIssues: () => Promise.resolve(beadsOutcomeOf(JSON.stringify(issues))),
      createBeadsStampReader: () => () =>
        Promise.resolve({ kind: "present", stamp: String(revision) }),
    },
    replaceIssues: (next) => {
      issues = next
      revision += 1
    },
  }
}

/** 本物の口のうち、覚える口だけを一時ディレクトリへ向ける（利用者のホームへ書かない）。 */
function testPorts(): TaskSummaryPorts {
  const memoryPath = join(root(), "task-summary.json")
  return {
    ...REAL_TASK_SUMMARY_PORTS,
    clock: {
      ...REAL_TASK_SUMMARY_PORTS.clock,
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
  return { kind: "known", items, omittedClosedCount: 0 }
}

/** 何も付けずに作った未着手の課題1件の要約。 */
function plainTodo(id: string, summary: string): Record<string, unknown> {
  return {
    id,
    summary,
    status: { kind: "known", status: "todo" },
    dependencies: [],
    waitingFor: [],
    labels: [],
    body: "",
    location: { kind: "none" },
  }
}

describe("watchTaskSummary", () => {
  it("bd の課題を ID の番号の昇順に出し、状態を読み替え、ラベルは字のまま写す", async () => {
    const intake = fakeIntake([
      openIssue("t-010", "未着手", {
        labels: ["任意のタグ"],
        created_at: "2026-01-13T00:00:00Z",
      }),
      openIssue("t-002", "保留", { status: "deferred" }),
      openIssue("t-003", "着手中", {
        status: "in_progress",
        dependencies: [{ issue_id: "t-003", depends_on_id: "t-010", type: "blocks" }],
      }),
      openIssue("t-001", "済み", { status: "closed", closed_at: "2026-01-14T12:00:00Z" }),
    ])
    const changes: unknown[] = []
    watch("/repo-fake", changes, intake.ports)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([
      known(
        { ...plainTodo("t-001", "済み"), status: { kind: "known", status: "done" } },
        { ...plainTodo("t-002", "保留"), status: { kind: "known", status: "hold" } },
        {
          ...plainTodo("t-003", "着手中"),
          status: { kind: "known", status: "doing" },
          dependencies: ["t-010"],
          waitingFor: ["t-010"],
        },
        { ...plainTodo("t-010", "未着手"), labels: ["任意のタグ"] },
      ),
    ])
  })

  it("main を動かさずに bd で閉じると、次の見回りで done に変わる", async () => {
    const intake = fakeIntake([openIssue("t-001", "閉じる前")])
    const changes: unknown[] = []
    watch("/repo-fake", changes, intake.ports)
    await waitForChanges(changes, 1)

    intake.replaceIssues([
      openIssue("t-001", "閉じる前", { status: "closed", closed_at: "2026-01-14T12:00:00Z" }),
    ])
    await waitForChanges(changes, 2)

    expect(changes).toEqual([
      known(plainTodo("t-001", "閉じる前")),
      known({ ...plainTodo("t-001", "閉じる前"), status: { kind: "known", status: "done" } }),
    ])
  })

  it(".beads が無ければ、初回に「Beads なし」を1回だけ通知し、見回りを重ねても通知を重ねない", async () => {
    const changes: unknown[] = []
    watch("/repo-fake", changes, {
      createBeadsStampReader: () => () => Promise.resolve({ kind: "missing" }),
    })
    await waitForChanges(changes, 1)
    await waitForQuietPolls()

    expect(changes).toEqual([{ kind: "no-beads" }])
  })

  it("初回の読みがタイムアウトしたら「不明」を知らせ、次に読めたら一覧を知らせる", async () => {
    const outcomes: BeadsOutcome[] = [{ kind: "timed-out" }, { kind: "issues", issues: [] }]
    const changes: unknown[] = []
    watcher = watchTaskSummary("/repo-fake", (tasks) => changes.push(tasks), {
      intervalMs: TEST_POLL_INTERVAL_MS,
      ports: {
        ...testPorts(),
        readBeadsIssues: () => Promise.resolve(outcomes.shift() ?? { kind: "timed-out" }),
        createBeadsStampReader: () => () => Promise.resolve({ kind: "present", stamp: undefined }),
      },
    })
    watcher.setWatching(true)
    await waitForChanges(changes, 2)

    expect(changes).toEqual([{ kind: "unknown" }, known()])
  })
})
