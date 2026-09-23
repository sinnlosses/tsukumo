import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  watchTaskSummary,
  type TaskSummaryWatcher,
} from "../../../src/server/adapter/task-summary.ts"

// 本物の `git` を起こす（`main` の先端を見て読み直すことそのものが検査の対象）。リポジトリは
// 一時ディレクトリに毎回作り、中身は架空のタスクだけにする。

// 実際のポーリング間隔（TASK_SUMMARY_POLL_INTERVAL_MS）を待つとテストが遅くなるので、
// テストだけ短い間隔に差し替える。
const TEST_POLL_INTERVAL_MS = 10

/** 通知を待つ上限。1回の見回りは `git` を2回起こすので、間隔より十分長くとる。 */
const WAIT_LIMIT_MS = 3000

/** 「通知が来ない」ことを確かめるときに待つ長さ（見回りが何周もする長さ）。 */
const QUIET_PERIOD_MS = 300

let root: string
let watcher: TaskSummaryWatcher | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tsukumo-task-summary-"))
})

afterEach(() => {
  watcher?.close()
  watcher = undefined
  rmSync(root, { recursive: true, force: true })
})

function git(cwd: string, ...args: readonly string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" })
}

/** `branch` を初期ブランチにしたリポジトリを作る。署名やフックは利用者の設定に左右されないよう切る。 */
function initRepository(branch: string): string {
  const repository = join(root, "repository")
  mkdirSync(repository)
  git(repository, "init", "-b", branch)
  git(repository, "config", "user.name", "tsukumo-test")
  git(repository, "config", "user.email", "tsukumo-test@example.invalid")
  git(repository, "config", "commit.gpgsign", "false")
  git(repository, "config", "core.hooksPath", "/dev/null")
  return repository
}

function writeTasks(cwd: string, tasks: readonly Record<string, string>[]): void {
  mkdirSync(join(cwd, "develop"), { recursive: true })
  writeFileSync(join(cwd, "develop", "tasks.json"), JSON.stringify(tasks))
}

function commitTasks(cwd: string, tasks: readonly Record<string, string>[]): void {
  writeTasks(cwd, tasks)
  git(cwd, "add", "develop/tasks.json")
  git(cwd, "commit", "-m", "tasks")
}

/** `main` を出している本体とは別に、`git merge main` をしない作業ツリーを切る。 */
function addWorktree(repository: string): string {
  const worktree = join(root, "worktree")
  git(repository, "worktree", "add", "-b", "feature", worktree)
  return worktree
}

function watch(cwd: string, changes: unknown[]): void {
  watcher = watchTaskSummary(cwd, (tasks) => changes.push(tasks), TEST_POLL_INTERVAL_MS)
}

/** 通知が `count` 件に達するまで待つ（超えたら、そこまでの通知のまま期待値との比較で落ちる）。 */
async function waitForChanges(changes: readonly unknown[], count: number): Promise<void> {
  const deadline = performance.now() + WAIT_LIMIT_MS
  while (changes.length < count && performance.now() < deadline) {
    await sleep(TEST_POLL_INTERVAL_MS)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 通知されるはずの1件。**フィールドの一覧は shared 側の仕事**なので、ここでは1箇所にまとめて
 * 置き、この層が見ている「どこから・いつ読み直したか」だけがテストの主題であることを保つ。 */
function notified(id: string, summary: string, status: string): Record<string, unknown> {
  return { id, summary, status, difficulty: undefined, dependencies: [] }
}

/** `TaskSummaryResult` の `known` 側を、`notified` と組み合わせて作る。 */
function known(...items: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { kind: "known", items }
}

const UNKNOWN: Record<string, unknown> = { kind: "unknown" }

describe("watchTaskSummary", () => {
  it("起こした時点で main の develop/tasks.json を読んで通知する", async () => {
    const repository = initRepository("main")
    commitTasks(repository, [{ id: "T-1", summary: "ダミーのタスク", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([known(notified("T-1", "ダミーのタスク", "todo"))])
  })

  it("main だけに入ったコミットが、merge main していない作業ツリーに届く（作業ツリーのファイルは見ない）", async () => {
    const repository = initRepository("main")
    commitTasks(repository, [{ id: "T-1", summary: "1つめ", status: "todo" }])
    const worktree = addWorktree(repository)
    const changes: unknown[] = []
    watch(worktree, changes)
    await waitForChanges(changes, 1)

    // 作業ツリーのファイルを書き換えても（コミットしても）main が動かなければ読み直さない。
    commitTasks(worktree, [{ id: "T-9", summary: "作業ツリーだけ", status: "todo" }])
    await sleep(QUIET_PERIOD_MS)
    expect(changes).toHaveLength(1)

    commitTasks(repository, [{ id: "T-2", summary: "2つめ", status: "in_progress" }])
    await waitForChanges(changes, 2)

    expect(changes).toEqual([
      known(notified("T-1", "1つめ", "todo")),
      known(notified("T-2", "2つめ", "in_progress")),
    ])
  })

  it("main に develop/tasks.json が無くなったら「不明」を通知し、戻ったら追従する", async () => {
    const repository = initRepository("main")
    commitTasks(repository, [{ id: "T-1", summary: "1つめ", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    git(repository, "rm", "--quiet", "develop/tasks.json")
    git(repository, "commit", "-m", "remove")
    await waitForChanges(changes, 2)

    commitTasks(repository, [{ id: "T-1", summary: "1つめ", status: "todo" }])
    await waitForChanges(changes, 3)

    expect(changes).toEqual([
      known(notified("T-1", "1つめ", "todo")),
      UNKNOWN,
      known(notified("T-1", "1つめ", "todo")),
    ])
  })

  it("main ブランチが無いリポジトリでは、作業ツリーにファイルがあっても呼ばれない（既定の「不明」のまま）", async () => {
    const repository = initRepository("trunk")
    commitTasks(repository, [{ id: "T-1", summary: "1つめ", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await sleep(QUIET_PERIOD_MS)

    expect(changes).toEqual([])
  })

  it("git リポジトリでないディレクトリでは、ファイルがあっても呼ばれない（既定の「不明」のまま）", async () => {
    writeTasks(root, [{ id: "T-1", summary: "1つめ", status: "todo" }])
    const changes: unknown[] = []
    watch(root, changes)
    await sleep(QUIET_PERIOD_MS)

    expect(changes).toEqual([])
  })

  it("close するとそれ以降は通知しない", async () => {
    const repository = initRepository("main")
    commitTasks(repository, [{ id: "T-1", summary: "1つめ", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)
    watcher?.close()

    commitTasks(repository, [{ id: "T-2", summary: "2つめ", status: "todo" }])
    await sleep(QUIET_PERIOD_MS)

    expect(changes).toHaveLength(1)
  })
})
