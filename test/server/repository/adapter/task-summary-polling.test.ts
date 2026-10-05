import { afterEach, describe, expect, it } from "vitest"

import {
  watchTaskSummary,
  type TaskSummaryPorts,
  type TaskSummaryWatcher,
} from "../../../../src/server/repository/adapter/task-summary.ts"
import type { BeadsIssue } from "../../../../src/shared/repository/beads-issue.ts"
import type { ProjectSettingsRead } from "../../../../src/shared/repository/project-settings.ts"
import { createManualClock } from "../../../fixture/manual-clock.ts"

// 偽の口と手で進める時計で、見回りが子プロセスを起こした回数を数える。

let watcher: TaskSummaryWatcher | undefined

afterEach(async () => {
  await watcher?.close()
  watcher = undefined
})

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
