import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

import {
  createAchievementCache,
  readAchievement,
  readAchievementCalendar,
  type ReadAchievementCalendarResult,
  type ReadAchievementResult,
} from "../../../../src/server/achievement/adapter/closed-issue.ts"
import type * as GitAdapter from "../../../../src/server/repository/adapter/git.ts"
import type { AchievementCalendar } from "../../../../src/shared/achievement/achievement-calendar.ts"
import type { DailyAchievement } from "../../../../src/shared/achievement/achievement.ts"
import { initBeadsWithIssuesOutsideGit, useBeadsHome } from "../../../fixture/beads-repository.ts"
import { initBeadsIssues, initRepository } from "../../../fixture/task-summary-repository.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 本物の `bd` を、`HOME` を一時ディレクトリへ向けて起こす（`useBeadsHome`）。課題は架空のものだけ。

// 本物の `bd` は負荷で5秒を超えうるので、製品の上限だけ延ばす。
vi.mock("../../../../src/server/repository/adapter/git.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof GitAdapter>()),
  GIT_TIMEOUT_MS: 60_000,
}))

const root = useTempDir("closed-issue")
useBeadsHome(() => join(root(), "home"))

// 木曜。今週の月曜からその4週前の月曜までが暦の範囲になる。
const TODAY = "2026-09-24"

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
      await readAchievement("2026-09-23", TODAY, createAchievementCache(repository)),
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
    const repository = await initBeadsIssues(root(), [
      ...before,
      issue("t-249", "今日1件目", ["2026-09-01", "10:00"], ["2026-09-23", "10:00"]),
      issue("t-250", "今日2件目（250件目）", ["2026-09-01", "10:00"], ["2026-09-23", "11:00"]),
    ])

    const achievement = known(
      await readAchievement("2026-09-23", TODAY, createAchievementCache(repository)),
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
      await readAchievement("2026-09-23", TODAY, createAchievementCache(dir)),
    )

    expect(achievement.doneTasks).toEqual([{ id: "t-001", summary: "今日済んだ" }])
  })

  it(".beads が無ければ「不明」", async () => {
    const repository = await initRepository(root())

    expect(await readAchievement("2026-09-23", TODAY, createAchievementCache(repository))).toEqual({
      kind: "ok",
      achievement: { kind: "unknown" },
    })
  })

  it(".beads があるのに bd が課題を読めなければ「取れなかった」", async () => {
    const repository = await initBeadsIssues(root(), [
      issue("t-001", "今日済んだ", ["2026-09-21", "10:00"], ["2026-09-23", "18:00"]),
    ])
    rmSync(join(repository, ".beads", "embeddeddolt"), { recursive: true, force: true })

    expect(await readAchievement("2026-09-23", TODAY, createAchievementCache(repository))).toEqual({
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
      await readAchievementCalendar(TODAY, createAchievementCache(repository)),
    )

    expect(calendar.days[0]).toEqual({ date: "2026-08-24", count: 1 })
    expect(calendar.days.at(-1)).toEqual({ date: TODAY, count: 0 })
    expect(calendar.days.find((day) => day.date === "2026-09-23")).toEqual({
      date: "2026-09-23",
      count: 2,
    })
    expect(calendar.days.reduce((sum, day) => sum + day.count, 0)).toBe(3)
  })

  it(".beads が無ければ「不明」", async () => {
    const repository = await initRepository(root())

    expect(await readAchievementCalendar(TODAY, createAchievementCache(repository))).toEqual({
      kind: "ok",
      calendar: { kind: "unknown" },
    })
  })
})
