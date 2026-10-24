import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAchievementCache as createCacheWith,
  readAchievement,
  readAchievementCalendar,
  type AchievementCache,
  type ReadAchievementCalendarResult,
  type ReadAchievementResult,
} from "../../../../src/server/achievement/adapter/closed-issue.ts"
import type * as BeadsAdapter from "../../../../src/server/repository/adapter/beads.ts"
import type { BeadsOutcome, BeadsStamp } from "../../../../src/server/repository/adapter/beads.ts"
import {
  BEADS_REREAD_INTERVAL_MS,
  readBeadsIssues,
} from "../../../../src/server/repository/adapter/beads.ts"
import { createTaskBeadsSource } from "../../../../src/server/repository/adapter/task-beads-source.ts"
import type { AchievementCalendar } from "../../../../src/shared/achievement/achievement-calendar.ts"
import type { DailyAchievement } from "../../../../src/shared/achievement/achievement.ts"
// 取り込み口（`bd list`・`bd where`・印）のフェイク。課題は架空のものだけ。
const fakeIntake = vi.hoisted(
  (): {
    workspace: "found" | "missing"
    failed: boolean
    stamp: string | undefined
    listCalls: number
    issues: readonly unknown[]
  } => ({ workspace: "found", failed: false, stamp: undefined, listCalls: 0, issues: [] }),
)

vi.mock("../../../../src/server/repository/adapter/beads.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof BeadsAdapter>()
  const fakeRead = actual.memoizeByStamp((): Promise<BeadsOutcome> => {
    fakeIntake.listCalls += 1
    return Promise.resolve(
      fakeIntake.failed
        ? { kind: "failed" }
        : actual.beadsOutcomeOf(JSON.stringify(fakeIntake.issues)),
    )
  })
  return { ...actual, readBeadsIssues: fakeRead }
})

function readFakeBeadsStamp(): Promise<BeadsStamp> {
  return Promise.resolve(
    fakeIntake.workspace === "found"
      ? { kind: "present", stamp: fakeIntake.stamp }
      : { kind: "missing" },
  )
}

function createAchievementCache(cwd: string, now: () => number): AchievementCache {
  return createCacheWith(cwd, now, readFakeBeadsStamp)
}

beforeEach(() => {
  fakeIntake.workspace = "found"
  fakeIntake.failed = false
  fakeIntake.stamp = undefined
  fakeIntake.listCalls = 0
  fakeIntake.issues = []
})

const REPOSITORY = "/repo-fake"

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

describe("readAchievement", () => {
  it("その日のうちに閉じた課題をラベルに依らず終えたタスクにし、前の日に閉じた・開いた課題は数えない", async () => {
    fakeIntake.issues = [
      issue("t-001", "前の日に済んだ", ["2026-09-20", "10:00"], ["2026-09-22", "18:00"]),
      issue("t-002", "今日済んだ", ["2026-09-01", "10:00"], ["2026-09-23", "18:00"]),
      issue("t-003", "やめた", ["2026-09-21", "10:00"], ["2026-09-23", "19:00"], ["cancelled"]),
      issue("t-004", "まだ", ["2026-09-21", "10:00"], "open"),
    ]

    const achievement = known(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(REPOSITORY, fixedClock)),
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

  it("タスクの節目: 通算250件目（仮の刻み）に届いたタスクを返す", async () => {
    const before = Array.from({ length: 248 }, (_, index) =>
      issue(
        `t-${String(index + 1).padStart(3, "0")}`,
        `済み${String(index + 1)}`,
        ["2026-09-01", "10:00"],
        ["2026-09-22", "10:00"],
      ),
    )
    fakeIntake.issues = [
      ...before,
      issue("t-249", "今日1件目", ["2026-09-01", "10:00"], ["2026-09-23", "10:00"]),
      issue("t-250", "今日2件目（250件目）", ["2026-09-01", "10:00"], ["2026-09-23", "11:00"]),
    ]

    const achievement = known(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(REPOSITORY, fixedClock)),
    )

    expect(achievement.milestones).toEqual([{ count: 250, taskId: "t-250" }])
  })

  it(".beads が無ければ「不明」", async () => {
    fakeIntake.workspace = "missing"

    expect(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(REPOSITORY, fixedClock)),
    ).toEqual({
      kind: "ok",
      achievement: { kind: "unknown" },
    })
  })

  it(".beads があるのに bd が課題を読めなければ「取れなかった」", async () => {
    fakeIntake.failed = true

    expect(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(REPOSITORY, fixedClock)),
    ).toEqual({
      kind: "unavailable",
    })
  })
})

describe("readAchievementCalendar", () => {
  it("範囲（今日を含む週の月曜から4週前の月曜〜今日）の日ごとに、閉じた課題の数を返す", async () => {
    fakeIntake.issues = [
      issue("t-001", "範囲より前", ["2026-08-01", "10:00"], ["2026-08-23", "18:00"]),
      issue("t-002", "範囲の初日", ["2026-08-01", "10:00"], ["2026-08-24", "09:00"]),
      issue("t-003", "前の日1", ["2026-09-01", "10:00"], ["2026-09-23", "18:00"]),
      issue("t-004", "前の日2", ["2026-09-01", "10:00"], ["2026-09-23", "19:00"]),
      issue("t-005", "まだ", ["2026-09-01", "10:00"], "open"),
    ]

    const calendar = knownCalendar(
      await readAchievementCalendar(TODAY, createAchievementCache(REPOSITORY, fixedClock)),
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
      fakeIntake.stamp = "s1"
      fakeIntake.issues = [
        issue("t-001", "済んだ", ["2026-09-20", "10:00"], ["2026-09-23", "10:00"]),
      ]
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

    it("見回りと成果に同じ印の読み手を渡すと、続けて読んでも印の読みは読んだ回数だけで bd list は1回", async () => {
      const readStamp = vi.fn<typeof readFakeBeadsStamp>(readFakeBeadsStamp)
      const source = createTaskBeadsSource("/repo-both", {
        readBeadsIssues,
        readBeadsStamp: readStamp,
        now: () => 0,
      })
      const cache = createCacheWith("/repo-both", fixedClock, readStamp)

      await source.read()
      await doneCount(cache)

      expect(readStamp).toHaveBeenCalledTimes(2)
      expect(fakeIntake.listCalls).toBe(1)
    })

    it("印の読み手が missing を返せば bd list を打たず「不明」", async () => {
      const cache = createCacheWith("/repo-none", fixedClock, () =>
        Promise.resolve({ kind: "missing" }),
      )

      expect(await cache.readBeads()).toBe("missing")
      expect(fakeIntake.listCalls).toBe(0)
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
    fakeIntake.workspace = "missing"

    expect(
      await readAchievementCalendar(TODAY, createAchievementCache(REPOSITORY, fixedClock)),
    ).toEqual({
      kind: "ok",
      calendar: { kind: "unknown" },
    })
  })
})
