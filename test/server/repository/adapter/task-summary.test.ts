import { rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { createBeadsStampReader } from "../../../../src/server/repository/adapter/beads.ts"
import {
  REAL_TASK_SUMMARY_PORTS,
  watchTaskSummary,
  type TaskSummaryPorts,
  type TaskSummaryWatcher,
} from "../../../../src/server/repository/adapter/task-summary.ts"
import type { BeadsIssue } from "../../../../src/shared/repository/beads-issue.ts"
import {
  PROJECT_SETTINGS_PATH,
  type ProjectSettingsRead,
} from "../../../../src/shared/repository/project-settings.ts"
import { bd, initBeads, useBeadsHome } from "../../../fixture/beads-repository.ts"
import { git, initGitRepository } from "../../../fixture/git-repository.ts"
import { createManualClock } from "../../../fixture/manual-clock.ts"
import {
  writeProjectSettings,
  writeProjectSettingsContent,
} from "../../../fixture/project-settings.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 本物の `bd` を、`HOME` を一時ディレクトリへ向けて起こす（`useBeadsHome`）。
// リポジトリは一時ディレクトリに毎回作り、中身は架空の課題だけにする。

// 実際のポーリング間隔（TASK_SUMMARY_POLL_INTERVAL_MS）を待つとテストが遅くなるので、
// テストだけ短い間隔に差し替える。
const TEST_POLL_INTERVAL_MS = 10

/** `bd` の見回りは1回が約0.2秒なので、通知を待つ上限を長くとる。 */
const WAIT_LIMIT_MS = 15_000

/** 「通知が来ない」ことを確かめるときに待つ長さ（見回りが何周もする長さ）。 */
const QUIET_PERIOD_MS = 1000

const root = useTempDir("task-summary")
const home = useBeadsHome(() => join(root(), "home"))
let watcher: TaskSummaryWatcher | undefined

afterEach(async () => {
  await watcher?.close()
  watcher = undefined
})

/** `main` に1件コミットしたリポジトリ（プロジェクトの設定も `.beads` も置かない）。 */
async function initRepository(): Promise<string> {
  const repository = join(root(), "repository")
  await initGitRepository(repository)
  writeFileSync(join(repository, "README.md"), "架空のリポジトリ")
  await git(repository, "add", "README.md")
  await git(repository, "commit", "-m", "init")
  return repository
}

/** プロジェクトの設定を置き、`.beads` を作ったリポジトリ。 */
async function initBeadsRepository(): Promise<string> {
  const repository = await initRepository()
  writeProjectSettings(repository)
  initBeads(repository)
  return repository
}

/** `main` を出している本体とは別に、`git merge main` をしない作業ツリーを切る。 */
async function addWorktree(repository: string): Promise<string> {
  const worktree = join(root(), "worktree")
  await git(repository, "worktree", "add", "-b", "feature", worktree)
  return worktree
}

function watch(cwd: string, changes: unknown[]): void {
  watcher = watchTaskSummary(cwd, (tasks) => changes.push(tasks), {
    intervalMs: TEST_POLL_INTERVAL_MS,
    ports: REAL_TASK_SUMMARY_PORTS,
  })
  watcher.setWatching(true)
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

/** `TaskSummaryResult` の `known` 側を組み立てる。 */
function known(...items: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { kind: "known", items, runPrompt: "/next-task {id}" }
}

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

/** 何も付けずに作った未着手の課題1件の要約。 */
function plainTodo(id: string, summary: string): Record<string, unknown> {
  return {
    id,
    summary,
    status: "todo",
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
    assignee: undefined,
    body: BEADS_EMPTY_BODY,
    location: { kind: "none" },
  }
}

describe("watchTaskSummary", () => {
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
      await waitForChanges(changes, 1)

      expect(changes).toEqual([
        known(
          { ...plainTodo("T-001", "済み"), status: "done" },
          {
            ...plainTodo("T-002", "保留"),
            status: "hold",
            difficulty: "haiku",
            loopable: "N",
          },
          {
            ...plainTodo("T-003", "着手中"),
            status: "doing",
            dependencies: ["T-010"],
            assignee: "wt-test",
          },
          { ...plainTodo("T-010", "未着手"), difficulty: "opus", loopable: "Y" },
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
      await waitForChanges(changes, 1)

      await bd(repository, home(), "close", "t-001")
      await waitForChanges(changes, 2)

      expect(changes).toEqual([
        known(plainTodo("T-001", "閉じる前")),
        known({ ...plainTodo("T-001", "閉じる前"), status: "done" }),
      ])
    },
  )

  it("プロジェクトの設定が無くても、.beads があれば一覧を出す", { timeout: 60_000 }, async () => {
    const repository = await initRepository()
    initBeads(repository)
    await bd(repository, home(), "create", "--id", "t-001", "設定なし")
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    expect(changes).toEqual([known(plainTodo("T-001", "設定なし"))])
  })

  it("設定を消しても、.beads があれば一覧を出し続ける", { timeout: 60_000 }, async () => {
    const repository = await initBeadsRepository()
    await bd(repository, home(), "create", "--id", "t-001", "架空")
    const changes: unknown[] = []
    watch(repository, changes)
    await waitForChanges(changes, 1)

    rmSync(join(repository, PROJECT_SETTINGS_PATH))
    await sleep(QUIET_PERIOD_MS)

    expect(changes).toEqual([known(plainTodo("T-001", "架空"))])
  })

  it(".beads が無ければ、設定があっても無くても呼ばれない（既定の「不明」のまま）", async () => {
    const repository = await initRepository()
    const changes: unknown[] = []
    watch(repository, changes)
    await sleep(QUIET_PERIOD_MS)
    writeProjectSettings(repository)
    await sleep(QUIET_PERIOD_MS)

    expect(changes).toEqual([])
  })

  it(
    "設定の形が壊れたら、.beads があっても「設定が読めない」を通知する",
    { timeout: 60_000 },
    async () => {
      const repository = await initBeadsRepository()
      await bd(repository, home(), "create", "--id", "t-001", "架空")
      const changes: unknown[] = []
      watch(repository, changes)
      await waitForChanges(changes, 1)

      writeProjectSettingsContent(repository, '{ "tasks": { "mainBranch": ')
      await waitForChanges(changes, 2)

      expect(changes).toEqual([known(plainTodo("T-001", "架空")), { kind: "settings-invalid" }])
    },
  )
})

// 偽の口と手で進める時計で、見回りが子プロセスを起こした回数を数える。

const FAKE_INTERVAL_MS = 5000

/** 起こした順の呼び出しの記録。 */
type FakeCalls = string[]

type FakePortsOptions = {
  /** 取り直すたびに読む変化の印（`undefined` は取れない）。 */
  readonly stamp: () => string | undefined
  /** 設定の読みが最初の1回だけ例外を投げる。 */
  readonly settingsThrowsFirst: boolean
  readonly settings: ProjectSettingsRead
}

function fakePorts(
  calls: FakeCalls,
  clock: TaskSummaryPorts["clock"],
  options: FakePortsOptions,
): TaskSummaryPorts {
  let settingsAsked = 0
  return {
    readProjectSettings: () => {
      settingsAsked += 1
      if (options.settingsThrowsFirst && settingsAsked === 1) {
        return Promise.reject(new Error("架空の失敗"))
      }
      return Promise.resolve(options.settings)
    },
    readBeadsIssues: () => {
      calls.push("bd list")
      return Promise.resolve({ kind: "issues", issues: [] })
    },
    createBeadsStampReader: () => () => Promise.resolve(options.stamp()),
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
    const failures: unknown[] = []
    let stamp: string | undefined = "stamp-1"
    const fake = watchTaskSummary(
      "/cwd",
      (tasks) => changes.push(tasks),
      {
        intervalMs: FAKE_INTERVAL_MS,
        ports: fakePorts(calls, manual.clock, {
          stamp: () => stamp,
          settingsThrowsFirst: false,
          settings: {
            kind: "read",
            tasks: { mainBranch: "main", runPrompt: "/next-task {id}" },
          },
          ...options,
        }),
      },
      (error) => failures.push(error),
    )
    watcher = fake
    return {
      fake,
      calls,
      manual,
      changes,
      failures,
      setStamp: (next: string | undefined) => {
        stamp = next
      },
      count: (name: string) => calls.filter((call) => call === name).length,
    }
  }

  it("設定の runPrompt が一覧に付いて届く", async () => {
    const { fake, changes } = startFake({
      settings: { kind: "read", tasks: { mainBranch: "main", runPrompt: "/work {id}" } },
    })
    fake.setWatching(true)
    await settle()

    expect(changes).toMatchObject([{ kind: "known", runPrompt: "/work {id}" }])
  })

  it("設定が無ければ、既定の文面を付けて Beads を読む", async () => {
    const { fake, changes, count } = startFake({ settings: { kind: "none" } })
    fake.setWatching(true)
    await settle()

    expect(count("bd list")).toBe(1)
    expect(changes).toMatchObject([{ kind: "known", runPrompt: "/next-task {id}" }])
  })

  it("設定が「使わない」なら、Beads を読まずに「使わない」を届ける", async () => {
    const { fake, changes, count } = startFake({ settings: { kind: "off" } })
    fake.setWatching(true)
    await settle()

    expect(count("bd list")).toBe(0)
    expect(changes).toEqual([{ kind: "off" }])
  })

  it("設定が読めなければ、Beads を読まずに「設定が読めない」を届ける", async () => {
    const { fake, changes, count } = startFake({ settings: { kind: "invalid" } })
    fake.setWatching(true)
    await settle()

    expect(count("bd list")).toBe(0)
    expect(changes).toEqual([{ kind: "settings-invalid" }])
  })

  it("見回りが1回投げても、失敗を渡して次の間隔でまた読む", async () => {
    const { fake, manual, changes, failures } = startFake({ settingsThrowsFirst: true })
    fake.setWatching(true)
    await settle()

    expect(failures).toHaveLength(1)
    expect(changes).toEqual([])
    expect(manual.pending()).toBe(1)

    manual.advance(FAKE_INTERVAL_MS)
    await settle()

    expect(changes).toMatchObject([{ kind: "known" }])
  })

  it("見張りを動かさないあいだは、時計を何周進めても起こした時点の1回しか読まない", async () => {
    const { manual, count } = startFake({ stamp: () => undefined })
    await settle()
    for (let round = 0; round < 10; round += 1) {
      manual.advance(FAKE_INTERVAL_MS)
      await settle()
    }

    expect(count("bd list")).toBe(1)
    expect(manual.pending()).toBe(0)
  })

  it("動かすとすぐ1回読み、間隔ごとに予約する。止めると予約を消す", async () => {
    const { fake, manual, count } = startFake({ stamp: () => undefined })
    await settle()
    expect(count("bd list")).toBe(1)

    fake.setWatching(true)
    await settle()
    expect(count("bd list")).toBe(2)
    expect(manual.pending()).toBe(1)

    manual.advance(FAKE_INTERVAL_MS)
    await settle()
    expect(count("bd list")).toBe(3)

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

  it("変化の印が同じなら、何周進めても bd list を起こさない", async () => {
    const { fake, manual, count } = startFake()
    fake.setWatching(true)
    await settle()
    for (let round = 0; round < 5; round += 1) {
      manual.advance(FAKE_INTERVAL_MS)
      await settle()
    }

    expect(count("bd list")).toBe(1)
  })

  it("変化の印が変わると1回読み、要約が同じなら知らせず、次の周は読まない", async () => {
    const { fake, manual, count, changes, setStamp } = startFake()
    fake.setWatching(true)
    await settle()

    setStamp("stamp-2")
    manual.advance(FAKE_INTERVAL_MS)
    await settle()
    manual.advance(FAKE_INTERVAL_MS)
    await settle()

    expect(count("bd list")).toBe(2)
    expect(changes).toHaveLength(1)
  })

  it("変化の印が取れないときは、毎回 bd list を読む", async () => {
    const { fake, manual, count } = startFake({ stamp: () => undefined })
    fake.setWatching(true)
    await settle()
    for (let round = 0; round < 3; round += 1) {
      manual.advance(FAKE_INTERVAL_MS)
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
      stamp: () => stamp,
      settingsThrowsFirst: false,
      settings: { kind: "none" },
    })
    watcher = watchTaskSummary("/cwd", (tasks) => changes.push(tasks), {
      intervalMs: FAKE_INTERVAL_MS,
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
    manual.advance(FAKE_INTERVAL_MS - 1)
    await settle()
    expect(changes).toHaveLength(1)
    manual.advance(1)
    await settle()
    expect(changes).toHaveLength(2)
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
    const repository = await initRepository()
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
    const repository = await initRepository()
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
    const repository = await initRepository()

    expect(await createBeadsStampReader(repository)()).toBeUndefined()
  })
})
