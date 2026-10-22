import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAchievementCache,
  readAchievement,
  readAchievementCalendar,
  type ReadAchievementCalendarResult,
  type ReadAchievementResult,
} from "../../../../src/server/achievement/adapter/closed-issue.ts"
import type * as BeadsAdapter from "../../../../src/server/repository/adapter/beads.ts"
import type { BeadsOutcome } from "../../../../src/server/repository/adapter/beads.ts"
import {
  BEADS_REREAD_INTERVAL_MS,
  readBeadsIssues,
} from "../../../../src/server/repository/adapter/beads.ts"
import type * as GitAdapter from "../../../../src/server/repository/adapter/git.ts"
import { createTaskBeadsSource } from "../../../../src/server/repository/adapter/task-beads-source.ts"
import type { AchievementCalendar } from "../../../../src/shared/achievement/achievement-calendar.ts"
import type { DailyAchievement } from "../../../../src/shared/achievement/achievement.ts"
import {
  bd,
  initBeadsWithIssuesOutsideGit,
  useBeadsHome,
} from "../../../fixture/beads-repository.ts"
import { initBeadsIssues, initRepository } from "../../../fixture/task-summary-repository.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 本物の `bd` を、`HOME` を一時ディレクトリへ向けて起こす（`useBeadsHome`）。課題は架空のものだけ。

// 本物の `bd` は負荷で5秒を超えうるので、製品の上限だけ延ばす。
vi.mock("../../../../src/server/repository/adapter/git.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof GitAdapter>()),
  GIT_TIMEOUT_MS: 60_000,
}))

// 取り込み口（`bd list`・`bd where`・印）のフェイク。`fakeIntake.active` の間だけ本物の代わりに使う。
const fakeIntake = vi.hoisted(
  (): {
    active: boolean
    stamp: string | undefined
    listCalls: number
    issues: readonly unknown[]
  } => ({ active: false, stamp: undefined, listCalls: 0, issues: [] }),
)

vi.mock("../../../../src/server/repository/adapter/beads.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof BeadsAdapter>()
  const fakeRead = actual.memoizeByStamp((): Promise<BeadsOutcome> => {
    fakeIntake.listCalls += 1
    return Promise.resolve(actual.beadsOutcomeOf(JSON.stringify(fakeIntake.issues)))
  })
  return {
    ...actual,
    readBeadsIssues: (cwd: string, stamp: string | undefined) =>
      fakeIntake.active ? fakeRead(cwd, stamp) : actual.readBeadsIssues(cwd, stamp),
    readBeadsWorkspace: (cwd: string) =>
      fakeIntake.active
        ? Promise.resolve({ kind: "found", dir: "/fake/.beads" })
        : actual.readBeadsWorkspace(cwd),
    readBeadsStampOf: (dir: string) =>
      fakeIntake.active ? Promise.resolve(fakeIntake.stamp) : actual.readBeadsStampOf(dir),
  }
})

const root = useTempDir("closed-issue")
useBeadsHome(() => join(root(), "home"))

// 木曜。今週の月曜からその4週前の月曜までが暦の範囲になる。
const TODAY = "2026-09-24"

const fixedClock = (): number => 0

/**
 * `date`（`YYYY-MM-DD`）の `hhmm` を、`readAchievement` が読む `Temporal.Now.timeZoneId()` と同じゾーンのローカル時刻として、オフセット付き ISO に直す。
 * 単体テストのプロセスは `TZ` が `UTC` に固定されるので、`+09:00` のような固定のオフセットは使わない。
 */
function isoDateAt(date: string, hhmm: string): string {
  return Temporal.PlainDateTime.from(`${date}T${hhmm}:00`)
    .toZonedDateTime(Temporal.Now.timeZoneId())
    .toString({ timeZoneName: "never" })
}

/** `bd export` の1行の形の課題。時刻はローカル時刻の `date` の `hhmm`。 */
function issue(
  id: string,
  title: string,
  created: readonly [string, string],
  closed: readonly [string, string] | "open",
  labels: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  return {
    id,
    title,
    status: closed === "open" ? "open" : "closed",
    created_at: isoDateAt(...created),
    ...(closed === "open" ? {} : { closed_at: isoDateAt(...closed) }),
    labels,
  }
}

/** 「読めた」前提のテストで使う。前提が崩れたら例外を投げて落とす（期待値の食い違いより先に、なぜ崩れたかが分かる）。 */
function known(result: ReadAchievementResult): Extract<DailyAchievement, { kind: "known" }> {
  if (result.kind !== "ok" || result.achievement.kind !== "known") {
    throw new Error("known な achievement ではなかった")
  }
  return result.achievement
}

/** {@link known} の暦の版。 */
function knownCalendar(
  result: ReadAchievementCalendarResult,
): Extract<AchievementCalendar, { kind: "known" }> {
  if (result.kind !== "ok" || result.calendar.kind !== "known") {
    throw new Error("known な calendar ではなかった")
  }
  return result.calendar
}

describe("readAchievement", { timeout: 60_000 }, () => {
  it("その日のうちに閉じた課題をラベルに依らず終えたタスクにし、前の日に閉じた・開いた課題は数えない", async () => {
    const repository = await initBeadsIssues(root(), [
      issue("t-001", "前の日に済んだ", ["2026-09-20", "10:00"], ["2026-09-22", "18:00"]),
      issue("t-002", "今日済んだ", ["2026-09-01", "10:00"], ["2026-09-23", "18:00"]),
      issue("t-003", "やめた", ["2026-09-21", "10:00"], ["2026-09-23", "19:00"], ["cancelled"]),
      issue("t-004", "まだ", ["2026-09-21", "10:00"], "open"),
    ])

    const achievement = known(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(repository, fixedClock)),
    )

    expect(achievement).toMatchObject({
      doneTasks: [
        { id: "t-002", summary: "今日済んだ" },
        { id: "t-003", summary: "やめた" },
      ],
      graduations: [{ id: "t-002", registeredOn: "2026-09-01", days: 22 }],
      milestones: [],
    })
  })

  it("課題が変わったあとの読みは前の結果を先に返し、裏で読み直した結果が次の読みから出る", async () => {
    const repository = await initBeadsIssues(root(), [
      issue("t-001", "先に済んだ", ["2026-09-20", "10:00"], ["2026-09-23", "10:00"]),
      issue("t-002", "あとで閉じる", ["2026-09-20", "10:00"], "open"),
    ])
    const cache = createAchievementCache(repository, fixedClock)
    // `bd close` は閉じた時刻を今にするので、数える日も今日にする。
    const today = Temporal.Now.plainDateISO().toString()
    const doneCount = async (): Promise<number> =>
      known(await readAchievement(today, today, cache)).doneTasks.length
    expect(await doneCount()).toBe(0)

    await bd(repository, join(root(), "home"), "close", "t-002")

    expect(await doneCount()).toBe(0)
    await vi.waitFor(async () => expect(await doneCount()).toBe(1), { timeout: 30_000 })
  })

  it("タスクの節目: 通算250件目（仮の刻み）に届いたタスクを返す", async () => {
    const before = Array.from({ length: 248 }, (_, index) =>
      issue(
        `t-${String(index + 1).padStart(3, "0")}`,
        `済み${String(index + 1)}`,
        ["2026-09-01", "10:00"],
        ["2026-09-22", "10:00"],
      ),
    )
    const repository = await initBeadsIssues(root(), [
      ...before,
      issue("t-249", "今日1件目", ["2026-09-01", "10:00"], ["2026-09-23", "10:00"]),
      issue("t-250", "今日2件目（250件目）", ["2026-09-01", "10:00"], ["2026-09-23", "11:00"]),
    ])

    const achievement = known(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(repository, fixedClock)),
    )

    expect(achievement.milestones).toEqual([{ count: 250, taskId: "t-250" }])
  })

  it("git リポジトリでなくても .beads があれば終えたタスクを数える", async () => {
    const dir = join(root(), "outside-git")
    mkdirSync(dir, { recursive: true })
    await initBeadsWithIssuesOutsideGit(dir, [
      issue("t-001", "今日済んだ", ["2026-09-21", "10:00"], ["2026-09-23", "18:00"]),
    ])

    const achievement = known(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(dir, fixedClock)),
    )

    expect(achievement.doneTasks).toEqual([{ id: "t-001", summary: "今日済んだ" }])
  })

  it(".beads が無ければ「不明」", async () => {
    const repository = await initRepository(root())

    expect(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(repository, fixedClock)),
    ).toEqual({
      kind: "ok",
      achievement: { kind: "unknown" },
    })
  })

  it(".beads があるのに bd が課題を読めなければ「取れなかった」", async () => {
    const repository = await initBeadsIssues(root(), [
      issue("t-001", "今日済んだ", ["2026-09-21", "10:00"], ["2026-09-23", "18:00"]),
    ])
    rmSync(join(repository, ".beads", "embeddeddolt"), { recursive: true, force: true })

    expect(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(repository, fixedClock)),
    ).toEqual({
      kind: "unavailable",
    })
  })
})

describe("readAchievementCalendar", { timeout: 60_000 }, () => {
  it("範囲（今日を含む週の月曜から4週前の月曜〜今日）の日ごとに、閉じた課題の数を返す", async () => {
    const repository = await initBeadsIssues(root(), [
      issue("t-001", "範囲より前", ["2026-08-01", "10:00"], ["2026-08-23", "18:00"]),
      issue("t-002", "範囲の初日", ["2026-08-01", "10:00"], ["2026-08-24", "09:00"]),
      issue("t-003", "前の日1", ["2026-09-01", "10:00"], ["2026-09-23", "18:00"]),
      issue("t-004", "前の日2", ["2026-09-01", "10:00"], ["2026-09-23", "19:00"]),
      issue("t-005", "まだ", ["2026-09-01", "10:00"], "open"),
    ])

    const calendar = knownCalendar(
      await readAchievementCalendar(TODAY, createAchievementCache(repository, fixedClock)),
    )

    expect(calendar.days[0]).toEqual({ date: "2026-08-24", count: 1 })
    expect(calendar.days.at(-1)).toEqual({ date: TODAY, count: 0 })
    expect(calendar.days.find((day) => day.date === "2026-09-23")).toEqual({
      date: "2026-09-23",
      count: 2,
    })
    expect(calendar.days.reduce((sum, day) => sum + day.count, 0)).toBe(3)
  })

  describe("一覧と同じ読みの共有（取り込み口のフェイク）", () => {
    beforeEach(() => {
      fakeIntake.active = true
      fakeIntake.stamp = "s1"
      fakeIntake.listCalls = 0
      fakeIntake.issues = [
        issue("t-001", "済んだ", ["2026-09-20", "10:00"], ["2026-09-23", "10:00"]),
      ]
    })
    afterEach(() => {
      fakeIntake.active = false
    })

    const doneCount = async (cache: ReturnType<typeof createAchievementCache>): Promise<number> =>
      known(await readAchievement("2026-09-23", TODAY, cache)).doneTasks.length

    it("同じ印で一覧と成果を続けて読んでも、bd list は1回", async () => {
      const source = createTaskBeadsSource("/repo-shared", {
        readBeadsIssues,
        readBeadsStamp: () => Promise.resolve({ kind: "present", stamp: "s1" }),
        now: () => 0,
      })
      const cache = createAchievementCache("/repo-shared", fixedClock)

      await source.read()
      expect(await doneCount(cache)).toBe(1)

      expect(fakeIntake.listCalls).toBe(1)
    })

    it("印が変わると読み直し、前の結果を先に返して裏で新しい結果に替わる", async () => {
      const cache = createAchievementCache("/repo-changed", fixedClock)
      expect(await doneCount(cache)).toBe(1)

      fakeIntake.stamp = "s2"
      fakeIntake.issues = [
        ...fakeIntake.issues,
        issue("t-002", "あとで済んだ", ["2026-09-20", "10:00"], ["2026-09-23", "11:00"]),
      ]

      expect(await doneCount(cache)).toBe(1)
      await vi.waitFor(async () => expect(await doneCount(cache)).toBe(2))
    })

    describe("印が動かないとき", () => {
      let nowMs = 0
      const clock = (): number => nowMs
      beforeEach(() => {
        nowMs = 1_000
      })

      const changeIssuesWithoutStamp = (): void => {
        fakeIntake.issues = [
          ...fakeIntake.issues,
          issue("t-002", "あとで済んだ", ["2026-09-20", "10:00"], ["2026-09-23", "11:00"]),
        ]
      }

      it("間隔の前は読み直さない", async () => {
        const cache = createAchievementCache("/repo-before", clock)
        expect(await doneCount(cache)).toBe(1)
        changeIssuesWithoutStamp()

        nowMs += BEADS_REREAD_INTERVAL_MS - 1

        expect(await doneCount(cache)).toBe(1)
        expect(fakeIntake.listCalls).toBe(1)
      })

      it("間隔が過ぎたら読み直し、前の結果を先に返して裏で新しい結果に替わる", async () => {
        const cache = createAchievementCache("/repo-due", clock)
        expect(await doneCount(cache)).toBe(1)
        changeIssuesWithoutStamp()

        nowMs += BEADS_REREAD_INTERVAL_MS

        expect(await doneCount(cache)).toBe(1)
        await vi.waitFor(async () => expect(await doneCount(cache)).toBe(2))
      })

      it("時計が戻ったら読み直す", async () => {
        const cache = createAchievementCache("/repo-back", clock)
        expect(await doneCount(cache)).toBe(1)
        changeIssuesWithoutStamp()

        nowMs -= 1

        expect(await doneCount(cache)).toBe(1)
        await vi.waitFor(async () => expect(await doneCount(cache)).toBe(2))
      })
    })
  })

  it(".beads が無ければ「不明」", async () => {
    const repository = await initRepository(root())

    expect(
      await readAchievementCalendar(TODAY, createAchievementCache(repository, fixedClock)),
    ).toEqual({
      kind: "ok",
      calendar: { kind: "unknown" },
    })
  })
})
