import { describe, expect, it } from "bun:test"

import {
  achievementReviewRequestText,
  isEmptyAchievementDay,
  nextDateKey,
  previousDateKey,
  readDailyAchievement,
  resolveAchievementDateKey,
  UNKNOWN_ACHIEVEMENT,
  type AchievementDoneTasks,
  type DailyAchievement,
} from "../../src/shared/achievement.ts"

// ここで使う日付・タスクはすべて手で書いた架空のもの（実物の履歴・リポジトリの記録は使わない）。

const FIXTURE_ACHIEVEMENT = {
  kind: "known",
  date: "2026-09-23",
  today: "2026-09-24",
  commitCount: 5,
  doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
  graduations: [],
  milestones: [],
  diary: { kind: "none" },
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

  it("卒業と節目もそのまま読む", () => {
    const achievement = {
      ...FIXTURE_ACHIEVEMENT,
      graduations: [{ id: "T-1", summary: "架空のタスク", registeredOn: "2026-09-10", days: 13 }],
      milestones: [
        { kind: "task", count: 250, taskId: "T-1" },
        { kind: "commit", count: 1000, time: "09:30" },
      ],
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

describe("isEmptyAchievementDay", () => {
  it("コミットも終えたタスクも0なら空", () => {
    expect(isEmptyAchievementDay(0, { kind: "known", items: [] })).toBe(true)
  })

  it("コミットがあれば空ではない", () => {
    expect(isEmptyAchievementDay(1, { kind: "known", items: [] })).toBe(false)
  })

  it("終えたタスクがあれば空ではない", () => {
    const doneTasks: AchievementDoneTasks = {
      kind: "known",
      items: [{ id: "T-1", summary: "架空のタスク" }],
    }
    expect(isEmptyAchievementDay(0, doneTasks)).toBe(false)
  })

  it("タスクの記録が無いときは、コミットが0でも空と決めない", () => {
    expect(isEmptyAchievementDay(0, { kind: "unknown" })).toBe(false)
  })
})

describe("achievementReviewRequestText", () => {
  const BASE = { date: "2026-09-24", today: "2026-09-24", chatMode: false }

  it("今日・タスクありの依頼文を組む", () => {
    const text = achievementReviewRequestText({
      ...BASE,
      commitCount: 42,
      doneTasks: {
        kind: "known",
        items: [{ id: "T-100", summary: "架空のタスク1" }],
      },
    })
    expect(text).toContain(
      "今日の成果を一緒に振り返ってほしい。main に入ったコミットは 42 件、終えたタスクは 1 件。",
    )
    expect(text).toContain("- T-100 架空のタスク1")
    expect(text).toContain("report は、何日の分を振り返ったかの1行でよい。")
  })

  it("昨日・それより前の言い方", () => {
    const yesterday = achievementReviewRequestText({
      ...BASE,
      date: "2026-09-23",
      commitCount: 1,
      doneTasks: { kind: "known", items: [] },
    })
    expect(yesterday.startsWith("昨日の成果")).toBe(true)

    const earlier = achievementReviewRequestText({
      ...BASE,
      date: "2026-09-21",
      commitCount: 1,
      doneTasks: { kind: "known", items: [] },
    })
    expect(earlier.startsWith("9月21日の成果")).toBe(true)
  })

  it("終えたタスクが0件なら一覧を出さず「終えたタスクは無いけれど」", () => {
    const text = achievementReviewRequestText({
      ...BASE,
      commitCount: 5,
      doneTasks: { kind: "known", items: [] },
    })
    expect(text).toContain("終えたタスクは無いけれど。")
    expect(text).not.toContain("終えたタスク:")
  })

  it("タスクの記録が無いときはタスクの文も一覧も出さない", () => {
    const text = achievementReviewRequestText({
      ...BASE,
      commitCount: 3,
      doneTasks: { kind: "unknown" },
    })
    expect(text).toContain("main に入ったコミットは 3 件。")
    expect(text).not.toContain("終えたタスク")
  })

  it("20件を超えると「ほか n 件」に畳む", () => {
    const items = Array.from({ length: 23 }, (_, index) => ({
      id: `T-${String(index)}`,
      summary: `架空のタスク${String(index)}`,
    }))
    const text = achievementReviewRequestText({
      ...BASE,
      commitCount: 30,
      doneTasks: { kind: "known", items },
    })
    expect(text).toContain("- ほか 3 件")
    expect(text.split("\n").filter((line) => line.startsWith("- T-"))).toHaveLength(20)
  })

  it("雑談中は report の1行を足さない", () => {
    const text = achievementReviewRequestText({
      ...BASE,
      chatMode: true,
      commitCount: 2,
      doneTasks: { kind: "known", items: [] },
    })
    expect(text).not.toContain("report は")
  })

  it("依頼文にはコミットの数とタスクの ID・summary だけが入る（会話の文面は入らない）", () => {
    const text = achievementReviewRequestText({
      ...BASE,
      commitCount: 1,
      doneTasks: { kind: "known", items: [{ id: "T-9", summary: "架空のタスク" }] },
    })
    expect(text).not.toContain("架空の会話")
  })
})
