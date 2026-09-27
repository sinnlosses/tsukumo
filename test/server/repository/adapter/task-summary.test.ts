import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  watchTaskSummary,
  type TaskSummaryWatcher,
} from "../../../../src/server/repository/adapter/task-summary.ts"
import { bd, initBeads, useBeadsHome } from "../../../fixture/beads-repository.ts"
import { git, initGitRepository } from "../../../fixture/git-repository.ts"
import { runSubprocessOrThrow } from "../../../fixture/subprocess.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 本物の `git` を起こす（`main` の先端を見て読み直すことそのものが検査の対象）。リポジトリは
// 一時ディレクトリに毎回作り、中身は架空のタスクだけにする。

// 実際のポーリング間隔（TASK_SUMMARY_POLL_INTERVALS）を待つとテストが遅くなるので、
// テストだけ短い間隔に差し替える。
const TEST_POLL_INTERVAL_MS = 10

/** 通知を待つ上限。1回の見回りは `git` を2回起こすので、間隔より十分長くとる。 */
const WAIT_LIMIT_MS = 3000

/** 「通知が来ない」ことを確かめるときに待つ長さ（見回りが何周もする長さ）。 */
const QUIET_PERIOD_MS = 300

const root = useTempDir("task-summary")
let watcher: TaskSummaryWatcher | undefined

afterEach(() => {
  watcher?.close()
  watcher = undefined
})

/** `branch` を初期ブランチにしたリポジトリを作る。署名やフックは利用者の設定に左右されないよう切る。 */
async function initRepository(branch: string): Promise<string> {
  const repository = join(root(), "repository")
  await initGitRepository(repository, branch)
  return repository
}

/** 新形式（`develop/task/T-xxx.md`）の1件を front matter で書く（claude-skills の
 * `docs/task-workflow-redesign.md` 3.2）。 */
function writeNewFormatTask(cwd: string, id: string, summary: string, status: string): void {
  mkdirSync(join(cwd, "develop", "task"), { recursive: true })
  const content = [
    "---",
    `id: ${id}`,
    `summary: ${summary}`,
    `status: ${status}`,
    "difficulty: sonnet",
    "loopable: Y",
    "dependencies: []",
    "---",
    "",
    "## 目的",
    "",
    "架空の本文。",
    "",
  ].join("\n")
  writeFileSync(join(cwd, "develop", "task", `${id}.md`), content)
}

async function commitNewFormatTasks(
  cwd: string,
  tasks: readonly {
    readonly id: string
    readonly summary: string
    readonly status: string
  }[],
): Promise<void> {
  for (const task of tasks) {
    writeNewFormatTask(cwd, task.id, task.summary, task.status)
  }
  await git(cwd, "add", "develop/task")
  await git(cwd, "commit", "-m", "tasks")
}

/** 共有の `.git` の下の台帳の置き場（claude-skills の `docs/task-workflow-redesign.md` 4.2）。 */
async function ledgerRoot(cwd: string): Promise<string> {
  const stdout = await runSubprocessOrThrow(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd },
  )
  return stdout.trim()
}

/** `id` に着手の印を立てる（`mkdir claim/T-xxx` そのもの。`owner` の中身は台帳の取り合いの判定に
 * しか使わないので、ここでは印の有無だけを作れば足りる）。 */
async function claim(cwd: string, id: string): Promise<void> {
  mkdirSync(join(await ledgerRoot(cwd), "task-workflow", "claim", id), { recursive: true })
}

/** `id` の着手の印を消す（`task release` 相当）。 */
async function release(cwd: string, id: string): Promise<void> {
  rmSync(join(await ledgerRoot(cwd), "task-workflow", "claim", id), {
    recursive: true,
    force: true,
  })
}

/** `main` を出している本体とは別に、`git merge main` をしない作業ツリーを切る。 */
async function addWorktree(repository: string): Promise<string> {
  const worktree = join(root(), "worktree")
  await git(repository, "worktree", "add", "-b", "feature", worktree)
  return worktree
}

function watch(cwd: string, changes: unknown[]): void {
  watcher = watchTaskSummary(cwd, (tasks) => changes.push(tasks), {
    git: TEST_POLL_INTERVAL_MS,
    beads: TEST_POLL_INTERVAL_MS,
  })
}

/** 通知が `count` 件に達するまで待つ（超えたら、そこまでの通知のまま期待値との比較で落ちる）。 */
async function waitForChanges(
  changes: readonly unknown[],
  count: number,
  limitMs = WAIT_LIMIT_MS,
): Promise<void> {
  const deadline = performance.now() + limitMs
  while (changes.length < count && performance.now() < deadline) {
    await sleep(TEST_POLL_INTERVAL_MS)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** `TaskSummaryResult` の `known` 側を組み立てる。 */
function known(...items: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { kind: "known", items }
}

/** 通知されるはずの1件（`difficulty`・`loopable` は `writeNewFormatTask` の既定値のまま）。 */
function notified(id: string, summary: string, status: string): Record<string, unknown> {
  return { id, summary, status, difficulty: "sonnet", loopable: "Y", dependencies: [] }
}

const UNKNOWN: Record<string, unknown> = { kind: "unknown" }

describe("watchTaskSummary", () => {
  it("起こした時点で main の develop/task/ を読んで通知する", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [
      { id: "T-001", summary: "ダミーのタスク", status: "todo" },
    ])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([known(notified("T-001", "ダミーのタスク", "todo"))])
  })

  it("main だけに入ったコミットが、merge main していない作業ツリーに届く（作業ツリーのファイルは見ない）", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "1つめ", status: "todo" }])
    const worktree = await addWorktree(repository)
    const changes: unknown[] = []
    watch(worktree, changes)
    await waitForChanges(changes, 1)

    // 作業ツリーのファイルを書き換えても（コミットしても）main が動かなければ読み直さない。
    await commitNewFormatTasks(worktree, [
      { id: "T-009", summary: "作業ツリーだけ", status: "todo" },
    ])
    await sleep(QUIET_PERIOD_MS)
    expect(changes).toHaveLength(1)

    await commitNewFormatTasks(repository, [{ id: "T-002", summary: "2つめ", status: "done" }])
    await waitForChanges(changes, 2)

    expect(changes).toEqual([
      known(notified("T-001", "1つめ", "todo")),
      known(notified("T-001", "1つめ", "todo"), notified("T-002", "2つめ", "done")),
    ])
  })

  it("main の develop/task/ が無くなったら「不明」を通知し、戻ったら追従する", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "1つめ", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    await git(repository, "rm", "--quiet", "-r", "develop/task")
    await git(repository, "commit", "-m", "remove")
    await waitForChanges(changes, 2)

    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "1つめ", status: "todo" }])
    await waitForChanges(changes, 3)

    expect(changes).toEqual([
      known(notified("T-001", "1つめ", "todo")),
      UNKNOWN,
      known(notified("T-001", "1つめ", "todo")),
    ])
  })

  it("main ブランチが無いリポジトリでは、作業ツリーにファイルがあっても呼ばれない（既定の「不明」のまま）", async () => {
    const repository = await initRepository("trunk")
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "1つめ", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await sleep(QUIET_PERIOD_MS)

    expect(changes).toEqual([])
  })

  it("git リポジトリでないディレクトリでは、ファイルがあっても呼ばれない（既定の「不明」のまま）", async () => {
    writeNewFormatTask(root(), "T-001", "1つめ", "todo")
    const changes: unknown[] = []
    watch(root(), changes)
    await sleep(QUIET_PERIOD_MS)

    expect(changes).toEqual([])
  })

  it("close するとそれ以降は通知しない", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "1つめ", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)
    watcher?.close()

    await commitNewFormatTasks(repository, [{ id: "T-002", summary: "2つめ", status: "todo" }])
    await sleep(QUIET_PERIOD_MS)

    expect(changes).toHaveLength(1)
  })

  it("main の develop/task/ から ID の数字順で読む（ファイルの順ではない）", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [
      { id: "T-030", summary: "後ろの番号", status: "todo" },
      { id: "T-002", summary: "先の番号", status: "done" },
    ])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([
      known(notified("T-002", "先の番号", "done"), notified("T-030", "後ろの番号", "todo")),
    ])
  })

  it("INVALID なファイルはその1件だけ読み飛ばす", async () => {
    const repository = await initRepository("main")
    writeNewFormatTask(repository, "T-001", "読める", "todo")
    writeFileSync(join(repository, "develop", "task", "T-002.md"), "---\nid: T-002\n壊れている")
    await git(repository, "add", "develop/task")
    await git(repository, "commit", "-m", "tasks")
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([known(notified("T-001", "読める", "todo"))])
  })

  it("台帳に着手の印があるタスクは doing として出る（ファイルの status は todo のまま）", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [
      { id: "T-001", summary: "着手中", status: "todo" },
      { id: "T-002", summary: "未着手", status: "todo" },
    ])
    await claim(repository, "T-001")
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([
      known(notified("T-001", "着手中", "doing"), notified("T-002", "未着手", "todo")),
    ])
  })

  it("着手の印は todo 以外には効かない（done はそのまま）", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "済み", status: "done" }])
    await claim(repository, "T-001")
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([known(notified("T-001", "済み", "done"))])
  })

  // 台帳（着手の印）は共有の `.git` の中だけで完結し、`main` を動かさない（`task claim` /
  // `task release`。claude-skills の `docs/task-workflow-redesign.md` 4.2）。先端が同じ
  // 見回りでも印だけ読み直して doing / todo を切り替える（受け入れ時の差し戻し）。
  it("main を動かさずに claim すると、次の見回りで doing になる", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "着手前", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)
    expect(changes).toEqual([known(notified("T-001", "着手前", "todo"))])

    await claim(repository, "T-001")
    await waitForChanges(changes, 2)

    expect(changes).toEqual([
      known(notified("T-001", "着手前", "todo")),
      known(notified("T-001", "着手前", "doing")),
    ])
  })

  it("main を動かさずに release すると、次の見回りで todo に戻る", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "着手前", status: "todo" }])
    await claim(repository, "T-001")
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)
    expect(changes).toEqual([known(notified("T-001", "着手前", "doing"))])

    await release(repository, "T-001")
    await waitForChanges(changes, 2)

    expect(changes).toEqual([
      known(notified("T-001", "着手前", "doing")),
      known(notified("T-001", "着手前", "todo")),
    ])
  })

  it("develop/task/ が無いときは「不明」", async () => {
    const repository = await initRepository("main")
    writeFileSync(join(repository, "README.md"), "架空のリポジトリ")
    await git(repository, "add", "README.md")
    await git(repository, "commit", "-m", "init")
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([UNKNOWN])
  })
})

// Beads 方式（`main` の先端の CLAUDE.md の `- タスクの置き場: beads`）。本物の `bd` を、`HOME` を
// 一時ディレクトリへ向けて起こす（`test/fixture/beads-repository.ts`）。`bd init` は1回数秒かかる。
describe("watchTaskSummary（Beads 方式）", () => {
  const home = useBeadsHome(() => join(root(), "home"))

  /** `bd` の見回りは1回が約0.2秒なので、通知を待つ上限を長くとる。 */
  const BEADS_WAIT_LIMIT_MS = 15_000

  /** Beads 方式の設定を `main` に入れ、`.beads` を作ったリポジトリ。 */
  async function initBeadsRepository(): Promise<string> {
    const repository = await initRepository("main")
    writeFileSync(
      join(repository, "CLAUDE.md"),
      "# 架空\n\n## タスク運用\n\n- ブランチ: 切らない\n- タスクの置き場: beads\n",
    )
    await git(repository, "add", "CLAUDE.md")
    await git(repository, "commit", "-m", "config")
    await initBeads(repository, home())
    return repository
  }

  it(
    "bd の課題を状態を読み替えて出し、着手中は作業ツリーの名前を添える。閉じた課題は done で出す",
    { timeout: 60_000 },
    async () => {
      const repository = await initBeadsRepository()
      await bd(
        repository,
        home(),
        "create",
        "--id",
        "t-010",
        "未着手",
        "-l",
        "difficulty:opus,loopable:Y",
      )
      await bd(
        repository,
        home(),
        "create",
        "--id",
        "t-002",
        "保留",
        "-l",
        "difficulty:haiku,loopable:N",
      )
      await bd(repository, home(), "update", "t-002", "--status", "pending")
      await bd(repository, home(), "create", "--id", "t-003", "着手中", "--deps", "t-010")
      await bd(repository, home(), "update", "t-003", "--claim")
      await bd(repository, home(), "create", "--id", "t-001", "済み")
      await bd(repository, home(), "close", "t-001")
      const changes: unknown[] = []
      watch(repository, changes)
      await waitForChanges(changes, 1, BEADS_WAIT_LIMIT_MS)

      expect(changes).toEqual([
        known(
          {
            id: "T-001",
            summary: "済み",
            status: "done",
            difficulty: undefined,
            loopable: undefined,
            dependencies: [],
            assignee: undefined,
          },
          {
            id: "T-002",
            summary: "保留",
            status: "hold",
            difficulty: "haiku",
            loopable: "N",
            dependencies: [],
            assignee: undefined,
          },
          {
            id: "T-003",
            summary: "着手中",
            status: "doing",
            difficulty: undefined,
            loopable: undefined,
            dependencies: ["T-010"],
            assignee: "wt-test",
          },
          {
            id: "T-010",
            summary: "未着手",
            status: "todo",
            difficulty: "opus",
            loopable: "Y",
            dependencies: [],
            assignee: undefined,
          },
        ),
      ])
    },
  )

  it(
    "main を動かさずに bd で閉じると、次の見回りで done に変わる",
    { timeout: 60_000 },
    async () => {
      const repository = await initBeadsRepository()
      await bd(repository, home(), "create", "--id", "t-001", "閉じる前")
      const changes: unknown[] = []
      watch(repository, changes)
      await waitForChanges(changes, 1, BEADS_WAIT_LIMIT_MS)

      await bd(repository, home(), "close", "t-001")
      await waitForChanges(changes, 2, BEADS_WAIT_LIMIT_MS)

      expect(changes).toEqual([
        known({
          id: "T-001",
          summary: "閉じる前",
          status: "todo",
          difficulty: undefined,
          loopable: undefined,
          dependencies: [],
          assignee: undefined,
        }),
        known({
          id: "T-001",
          summary: "閉じる前",
          status: "done",
          difficulty: undefined,
          loopable: undefined,
          dependencies: [],
          assignee: undefined,
        }),
      ])
    },
  )

  it("方式の行が beads なのに .beads が無ければ「不明」", async () => {
    const repository = await initRepository("main")
    writeFileSync(join(repository, "CLAUDE.md"), "## タスク運用\n\n- タスクの置き場: beads\n")
    await git(repository, "add", "CLAUDE.md")
    await commitNewFormatTasks(repository, [
      { id: "T-001", summary: "ファイルは見ない", status: "todo" },
    ])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1, BEADS_WAIT_LIMIT_MS)

    expect(changes).toEqual([UNKNOWN])
  })
})
