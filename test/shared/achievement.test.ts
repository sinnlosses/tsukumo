import { describe, expect, it } from "bun:test"

import {
  nextDateKey,
  previousDateKey,
  readDailyAchievement,
  resolveAchievementDateKey,
  UNKNOWN_ACHIEVEMENT,
  type DailyAchievement,
} from "../../src/shared/achievement.ts"

// ここで使う日付・タスクはすべて手で書いた架空のもの（実物の履歴・リポジトリの記録は使わない）。

const FIXTURE_ACHIEVEMENT = {
  kind: "known",
  date: "2026-09-23",
  today: "2026-09-24",
  commitCount: 5,
  doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
} satisfies DailyAchievement

describe("readDailyAchievement", () => {
  it("known の形はそのまま読む", () => {
    expect(readDailyAchievement(FIXTURE_ACHIEVEMENT)).toEqual(FIXTURE_ACHIEVEMENT)
  })

  it("doneTasks が unknown の形もそのまま読む", () => {
    const achievement = {
      ...FIXTURE_ACHIEVEMENT,
      doneTasks: { kind: "unknown" },
    } satisfies DailyAchievement
    expect(readDailyAchievement(achievement)).toEqual(achievement)
  })

  it("unknown はそのまま読む", () => {
    expect(readDailyAchievement({ kind: "unknown" })).toEqual({ kind: "unknown" })
  })

  it("読めない形（欄が欠けている・kind が知らない値・JSON でない）は「取れなかった」に倒す", () => {
    expect(readDailyAchievement({ kind: "known" })).toEqual(UNKNOWN_ACHIEVEMENT)
    expect(readDailyAchievement({ kind: "びっくり" })).toEqual(UNKNOWN_ACHIEVEMENT)
    expect(readDailyAchievement("成果ではない")).toEqual(UNKNOWN_ACHIEVEMENT)
    expect(readDailyAchievement(undefined)).toEqual(UNKNOWN_ACHIEVEMENT)
  })
})

describe("previousDateKey / nextDateKey", () => {
  it("前後の日を1日ぶんだけ動かす", () => {
    expect(previousDateKey("2026-09-24")).toBe("2026-09-23")
    expect(nextDateKey("2026-09-24")).toBe("2026-09-25")
  })

  it("月・年をまたぐ", () => {
    expect(previousDateKey("2026-10-01")).toBe("2026-09-30")
    expect(nextDateKey("2026-12-31")).toBe("2027-01-01")
  })
})

describe("resolveAchievementDateKey", () => {
  const TODAY = "2026-09-24"

  it("正しい日付キーはそのまま", () => {
    expect(resolveAchievementDateKey("2026-09-20", TODAY)).toBe("2026-09-20")
  })

  it("今日そのものもそのまま", () => {
    expect(resolveAchievementDateKey(TODAY, TODAY)).toBe(TODAY)
  })

  it("無い・読めない・今日より先のときは今日に倒す", () => {
    expect(resolveAchievementDateKey(undefined, TODAY)).toBe(TODAY)
    expect(resolveAchievementDateKey("あした", TODAY)).toBe(TODAY)
    expect(resolveAchievementDateKey("2026/09/20", TODAY)).toBe(TODAY)
    expect(resolveAchievementDateKey("2026-09-25", TODAY)).toBe(TODAY)
  })
})
