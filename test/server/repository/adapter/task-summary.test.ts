import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { createBeadsStampReader } from "../../../../src/server/repository/adapter/beads.ts"
import { PROJECT_SETTINGS_PATH } from "../../../../src/server/repository/adapter/project-settings.ts"
import {
  REAL_TASK_SUMMARY_PORTS,
  watchTaskSummary,
  type TaskSummaryPorts,
  type TaskSummaryWatcher,
} from "../../../../src/server/repository/adapter/task-summary.ts"
import type { BeadsIssue } from "../../../../src/shared/repository/beads-issue.ts"
import { bd, initBeads, useBeadsHome } from "../../../fixture/beads-repository.ts"
import { claimTask, git, initGitRepository, releaseTask } from "../../../fixture/git-repository.ts"
import { createManualClock } from "../../../fixture/manual-clock.ts"
import { writeProjectSettings } from "../../../fixture/project-settings.ts"
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
const home = useBeadsHome(() => join(root(), "home"))
let watcher: TaskSummaryWatcher | undefined

afterEach(async () => {
  await watcher?.close()
  watcher = undefined
})

/** `branch` を初期ブランチにし、ファイル方式のプロジェクトの設定を置いたリポジトリを作る。 */
async function initRepository(branch: string): Promise<string> {
  const repository = join(root(), "repository")
  await initGitRepository(repository, branch)
  writeProjectSettings(repository, "files")
  return repository
}

/** 新形式（`develop/task/T-xxx.md`）の1件を front matter で書く（claude-skills の
 * `docs/task-workflow-redesign.md` が正典）。 */
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

/** `main` を出している本体とは別に、`git merge main` をしない作業ツリーを切る。 */
async function addWorktree(repository: string): Promise<string> {
  const worktree = join(root(), "worktree")
  await git(repository, "worktree", "add", "-b", "feature", worktree)
  writeProjectSettings(worktree, "files")
  return worktree
}

function watch(cwd: string, changes: unknown[]): void {
  watcher = watchTaskSummary(cwd, (tasks) => changes.push(tasks), {
    intervals: { git: TEST_POLL_INTERVAL_MS, beads: TEST_POLL_INTERVAL_MS },
    ports: REAL_TASK_SUMMARY_PORTS,
  })
  watcher.setWatching(true)
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

/** `writeNewFormatTask` が書く本文（front matter より後ろ）。 */
const WRITTEN_BODY = "\n## 目的\n\n架空の本文。\n"

/** 通知されるはずの1件（`difficulty`・`loopable`・本文は `writeNewFormatTask` の既定値のまま）。 */
function notified(id: string, summary: string, status: string): Record<string, unknown> {
  return {
    id,
    summary,
    status,
    difficulty: "sonnet",
    loopable: "Y",
    dependencies: [],
    body: WRITTEN_BODY,
    location: { kind: "file", path: `develop/task/${id}.md` },
  }
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
    await watcher?.close()

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
    await claimTask(repository, "T-001")
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
    await claimTask(repository, "T-001")
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([known(notified("T-001", "済み", "done"))])
  })

  // 台帳（着手の印）は共有の `.git` の中だけで完結し、`main` を動かさない（`task claim` /
  // `task release`。claude-skills の `docs/task-workflow-redesign.md` が正典）。先端が同じ
  // 見回りでも印だけ読み直して doing / todo を切り替える（受け入れ時の差し戻し）。
  it("main を動かさずに claim すると、次の見回りで doing になる", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "着手前", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)
    expect(changes).toEqual([known(notified("T-001", "着手前", "todo"))])

    await claimTask(repository, "T-001")
    await waitForChanges(changes, 2)

    expect(changes).toEqual([
      known(notified("T-001", "着手前", "todo")),
      known(notified("T-001", "着手前", "doing")),
    ])
  })

  it("main を動かさずに release すると、次の見回りで todo に戻る", async () => {
    const repository = await initRepository("main")
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "着手前", status: "todo" }])
    await claimTask(repository, "T-001")
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)
    expect(changes).toEqual([known(notified("T-001", "着手前", "doing"))])

    await releaseTask(repository, "T-001")
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

  it("プロジェクトの設定が無いときは、develop/task/ があっても「不明」", async () => {
    const repository = await initRepository("main")
    rmSync(join(repository, PROJECT_SETTINGS_PATH))
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "1つめ", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([UNKNOWN])
  })

  it("見回りの途中で設定を書くと、main を動かさずに次の見回りで一覧が出る", async () => {
    const repository = await initRepository("main")
    rmSync(join(repository, PROJECT_SETTINGS_PATH))
    await commitNewFormatTasks(repository, [{ id: "T-001", summary: "1つめ", status: "todo" }])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    writeProjectSettings(repository, "files")
    await waitForChanges(changes, 2)

    expect(changes).toEqual([UNKNOWN, known(notified("T-001", "1つめ", "todo"))])
  })
})

/** 本文・完了条件・やることを付けずに作った課題の本文（`composeBeadsBody` が組む枠だけの骨組み）。 */
const BEADS_EMPTY_BODY = [
  "## 目的・背景",
  "",
  "## 決まっていること（蒸し返さない）",
  "",
  "## 解くべき論点",
  "",
  "## やること",
  "",
  "## 完了条件",
  "",
  "## 注意",
  "",
  "## 参考情報",
  "",
].join("\n")

// Beads 方式（プロジェクトの設定の `tasks.store` が `beads`）。本物の `bd` を、`HOME` を
// 一時ディレクトリへ向けて起こす（`useBeadsHome`）。
describe("watchTaskSummary（Beads 方式）", () => {
  /** `bd` の見回りは1回が約0.2秒なので、通知を待つ上限を長くとる。 */
  const BEADS_WAIT_LIMIT_MS = 15_000

  /** Beads 方式の設定を置き、`main` に1件コミットして `.beads` を作ったリポジトリ。 */
  async function initBeadsRepository(): Promise<string> {
    const repository = await initRepository("main")
    writeProjectSettings(repository, "beads")
    writeFileSync(join(repository, "README.md"), "架空のリポジトリ")
    await git(repository, "add", "README.md")
    await git(repository, "commit", "-m", "init")
    initBeads(repository)
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
        "-s",
        "pending",
      )
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
            body: BEADS_EMPTY_BODY,
            location: { kind: "none" },
          },
          {
            id: "T-002",
            summary: "保留",
            status: "hold",
            difficulty: "haiku",
            loopable: "N",
            dependencies: [],
            assignee: undefined,
            body: BEADS_EMPTY_BODY,
            location: { kind: "none" },
          },
          {
            id: "T-003",
            summary: "着手中",
            status: "doing",
            difficulty: undefined,
            loopable: undefined,
            dependencies: ["T-010"],
            assignee: "wt-test",
            body: BEADS_EMPTY_BODY,
            location: { kind: "none" },
          },
          {
            id: "T-010",
            summary: "未着手",
            status: "todo",
            difficulty: "opus",
            loopable: "Y",
            dependencies: [],
            assignee: undefined,
            body: BEADS_EMPTY_BODY,
            location: { kind: "none" },
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
          body: BEADS_EMPTY_BODY,
          location: { kind: "none" },
        }),
        known({
          id: "T-001",
          summary: "閉じる前",
          status: "done",
          difficulty: undefined,
          loopable: undefined,
          dependencies: [],
          assignee: undefined,
          body: BEADS_EMPTY_BODY,
          location: { kind: "none" },
        }),
      ])
    },
  )

  it("設定の方式が beads なのに .beads が無ければ「不明」", async () => {
    const repository = await initRepository("main")
    writeProjectSettings(repository, "beads")
    await commitNewFormatTasks(repository, [
      { id: "T-001", summary: "ファイルは見ない", status: "todo" },
    ])
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1, BEADS_WAIT_LIMIT_MS)

    expect(changes).toEqual([UNKNOWN])
  })
})

// 偽の口と手で進める時計で、見回りが子プロセスを起こした回数を数える。

const FAKE_INTERVALS = { git: 1500, beads: 5000 }

/** 起こした順の呼び出しの記録。 */
type FakeCalls = string[]

type FakePortsOptions = {
  readonly store: "files" | "beads"
  /** 取り直すたびに読む変化の印（`undefined` は取れない）。 */
  readonly stamp: () => string | undefined
  readonly commonDirFailsFirst: boolean
}

function fakePorts(
  calls: FakeCalls,
  clock: TaskSummaryPorts["clock"],
  options: FakePortsOptions,
): TaskSummaryPorts {
  let commonDirAsked = 0
  return {
    runGit: (_cwd, args) => {
      if (args.includes("--git-common-dir")) {
        calls.push("git common-dir")
        commonDirAsked += 1
        return Promise.resolve(
          options.commonDirFailsFirst && commonDirAsked === 1
            ? { kind: "failed" }
            : { kind: "output", stdout: "/common\n" },
        )
      }
      if (args.includes("ls-tree")) {
        calls.push("git ls-tree")
        return Promise.resolve({ kind: "output", stdout: "develop/task/T-001.md\n" })
      }
      calls.push("git rev-parse main")
      return Promise.resolve({ kind: "output", stdout: "head-1\n" })
    },
    runGitCatFileBatch: () => {
      calls.push("git cat-file")
      return Promise.resolve({
        kind: "output",
        contents: [
          "---\nid: T-001\nsummary: 架空\nstatus: todo\ndifficulty: sonnet\nloopable: Y\ndependencies: []\n---\n",
        ],
      })
    },
    readProjectSettings: () =>
      Promise.resolve({
        kind: "read",
        tasks: { store: options.store, mainBranch: "main", runPrompt: "/next-task {id}" },
      }),
    readBeadsIssues: () => {
      calls.push("bd list")
      return Promise.resolve({ kind: "issues", issues: [] })
    },
    createBeadsStampReader: () => () => Promise.resolve(options.stamp()),
    readClaimDir: () => {
      calls.push("readdir")
      return Promise.resolve(new Set<string>())
    },
    clock,
  }
}

/** 見回りの途中の `await` が片付くまで待つ（時間ではなく、待っている処理の数に依る）。 */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe("watchTaskSummary（偽の口と時計）", () => {
  function startFake(options: Partial<FakePortsOptions> = {}) {
    const calls: FakeCalls = []
    const manual = createManualClock()
    const changes: unknown[] = []
    let stamp: string | undefined = "stamp-1"
    const fake = watchTaskSummary("/cwd", (tasks) => changes.push(tasks), {
      intervals: FAKE_INTERVALS,
      ports: fakePorts(calls, manual.clock, {
        store: "files",
        stamp: () => stamp,
        commonDirFailsFirst: false,
        ...options,
      }),
    })
    watcher = fake
    return {
      fake,
      calls,
      manual,
      changes,
      setStamp: (next: string | undefined) => {
        stamp = next
      },
      count: (name: string) => calls.filter((call) => call === name).length,
    }
  }

  it("--git-common-dir は起動中に1回しか起こさない", async () => {
    const { fake, manual, count } = startFake()
    fake.setWatching(true)
    await settle()
    for (let round = 0; round < 5; round += 1) {
      manual.advance(FAKE_INTERVALS.git)
      await settle()
    }

    expect(count("git rev-parse main")).toBeGreaterThan(5)
    expect(count("git common-dir")).toBe(1)
  })

  it("--git-common-dir が取れなかった回は覚えず、次の回に取り直す", async () => {
    const { fake, manual, count } = startFake({ commonDirFailsFirst: true })
    fake.setWatching(true)
    await settle()
    manual.advance(FAKE_INTERVALS.git)
    await settle()
    manual.advance(FAKE_INTERVALS.git)
    await settle()

    expect(count("git common-dir")).toBe(2)
  })

  it("見張りを動かさないあいだは、時計を何周進めても起こした時点の1回しか読まない", async () => {
    const { manual, calls } = startFake()
    await settle()
    const afterStart = calls.length
    for (let round = 0; round < 10; round += 1) {
      manual.advance(FAKE_INTERVALS.beads)
      await settle()
    }

    expect(afterStart).toBeGreaterThan(0)
    expect(calls).toHaveLength(afterStart)
    expect(manual.pending()).toBe(0)
  })

  it("動かすとすぐ1回読み、間隔ごとに予約する。止めると予約を消す", async () => {
    const { fake, manual, calls } = startFake()
    await settle()
    const afterStart = calls.length

    fake.setWatching(true)
    await settle()
    const afterResume = calls.length
    expect(afterResume).toBeGreaterThan(afterStart)
    expect(manual.pending()).toBe(1)

    manual.advance(FAKE_INTERVALS.git)
    await settle()
    expect(calls.length).toBeGreaterThan(afterResume)

    fake.setWatching(false)
    expect(manual.pending()).toBe(0)
  })

  it("close のあとの setWatching は何もしない", async () => {
    const { fake, manual, calls } = startFake()
    await fake.close()
    const afterClose = calls.length
    fake.setWatching(true)
    await settle()

    expect(calls).toHaveLength(afterClose)
    expect(manual.pending()).toBe(0)
  })

  describe("Beads 方式", () => {
    it("変化の印が同じなら、何周進めても bd list を起こさない", async () => {
      const { fake, manual, count } = startFake({ store: "beads" })
      fake.setWatching(true)
      await settle()
      for (let round = 0; round < 5; round += 1) {
        manual.advance(FAKE_INTERVALS.beads)
        await settle()
      }

      expect(count("bd list")).toBe(1)
    })

    it("変化の印が変わると1回読み、要約が同じなら知らせず、次の周は読まない", async () => {
      const { fake, manual, count, changes, setStamp } = startFake({ store: "beads" })
      fake.setWatching(true)
      await settle()

      setStamp("stamp-2")
      manual.advance(FAKE_INTERVALS.beads)
      await settle()
      manual.advance(FAKE_INTERVALS.beads)
      await settle()

      expect(count("bd list")).toBe(2)
      expect(changes).toHaveLength(1)
    })

    it("変化の印が取れないときは、毎回 bd list を読む", async () => {
      const { fake, manual, count } = startFake({ store: "beads", stamp: () => undefined })
      fake.setWatching(true)
      await settle()
      for (let round = 0; round < 3; round += 1) {
        manual.advance(FAKE_INTERVALS.beads)
        await settle()
      }

      expect(count("bd list")).toBe(4)
    })

    it("変化の印が変わってから反映されるまでの遅れは、見回りの間隔以内", async () => {
      const calls: FakeCalls = []
      const manual = createManualClock()
      const changes: unknown[] = []
      let stamp: string | undefined = "stamp-1"
      let issueCount = 0
      const ports = fakePorts(calls, manual.clock, {
        store: "beads",
        stamp: () => stamp,
        commonDirFailsFirst: false,
      })
      watcher = watchTaskSummary("/cwd", (tasks) => changes.push(tasks), {
        intervals: FAKE_INTERVALS,
        ports: {
          ...ports,
          readBeadsIssues: () => {
            issueCount += 1
            return Promise.resolve({
              kind: "issues",
              issues: issueCount === 1 ? [] : [FICTIONAL_BEADS_ISSUE],
            })
          },
        },
      })
      watcher.setWatching(true)
      await settle()
      expect(changes).toHaveLength(1)

      stamp = "stamp-2"
      manual.advance(FAKE_INTERVALS.beads - 1)
      await settle()
      expect(changes).toHaveLength(1)
      manual.advance(1)
      await settle()
      expect(changes).toHaveLength(2)
    })
  })
})

const FICTIONAL_BEADS_ISSUE: BeadsIssue = {
  id: "t-001",
  title: "架空",
  status: "open",
  labels: [],
  blockedBy: [],
  assignee: undefined,
  createdAtEpochMilliseconds: 0,
  closedAtEpochMilliseconds: undefined,
  description: "",
  acceptanceCriteria: "",
  notes: "",
  externalRef: undefined,
}

describe("createBeadsStampReader", () => {
  it("課題を書き換えると変わり、書き換えなければ変わらない", { timeout: 60_000 }, async () => {
    const repository = await initRepository("main")
    initBeads(repository)
    await bd(repository, home(), "create", "--id", "t-001", "架空")
    const readStamp = createBeadsStampReader(repository)

    const before = await readStamp()
    const unchanged = await readStamp()
    await bd(repository, home(), "update", "t-001", "--claim")
    const after = await readStamp()

    expect(before).toBeDefined()
    expect(unchanged).toBe(before)
    expect(after).not.toBe(before)
  })

  it("別の作業ツリーからの書き換えでも変わる", { timeout: 60_000 }, async () => {
    const repository = await initRepository("main")
    initBeads(repository)
    await bd(repository, home(), "create", "--id", "t-001", "架空")
    const worktree = await addWorktree(repository)
    const readStamp = createBeadsStampReader(worktree)

    const before = await readStamp()
    await bd(worktree, home(), "update", "t-001", "--claim")

    expect(before).toBeDefined()
    expect(await readStamp()).not.toBe(before)
  })

  it(".beads が無ければ取れない（undefined）", async () => {
    const repository = await initRepository("main")

    expect(await createBeadsStampReader(repository)()).toBeUndefined()
  })
})
