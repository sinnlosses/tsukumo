import { describe, expect, it } from "vitest"

import {
  achievementReflectionRequestText,
  nextDateKey,
  previousDateKey,
  resolveAchievementDateKey,
  type AchievementTask,
} from "../../../src/shared/achievement/achievement.ts"

// ここで使う日付・タスクはすべて手で書いた架空のもの（実物の履歴・リポジトリの記録は使わない）。

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

  const chosen = (date: string) => ({ kind: "chosen", date }) as const

  it("選んだ正しい日付キーはそのまま", () => {
    expect(resolveAchievementDateKey(chosen("2026-09-20"), TODAY)).toBe("2026-09-20")
  })

  it("今日そのものを選んでもそのまま", () => {
    expect(resolveAchievementDateKey(chosen(TODAY), TODAY)).toBe(TODAY)
  })

  it("今日を選んだ・読めない・今日より先のときは今日に倒す", () => {
    expect(resolveAchievementDateKey({ kind: "today" }, TODAY)).toBe(TODAY)
    expect(resolveAchievementDateKey(chosen("あした"), TODAY)).toBe(TODAY)
    expect(resolveAchievementDateKey(chosen("2026/09/20"), TODAY)).toBe(TODAY)
    expect(resolveAchievementDateKey(chosen("2026-09-25"), TODAY)).toBe(TODAY)
  })
})

const ONE_TASK: readonly AchievementTask[] = [{ id: "T-1", summary: "架空のタスク" }]

describe("achievementReflectionRequestText", () => {
  const BASE = {
    date: "2026-09-24",
    today: "2026-09-24",
    doneTasks: ONE_TASK,
    graduations: [],
    milestones: [],
    alreadyWritten: false,
  }

  it("今日の依頼文を、終えたタスクの数と一覧としおりの頼みで組む", () => {
    const text = achievementReflectionRequestText({
      ...BASE,
      doneTasks: [{ id: "T-100", summary: "架空のタスク1" }],
    })
    expect(text).toContain(
      "今日の成果を一緒に振り返って、この日の日記を書いてほしい。終えたタスクは 1 件。",
    )
    expect(text).toContain("- T-100 架空のタスク1")
    expect(text).toContain("日記は diary ツールで1回書いて。")
    expect(text).toContain("しおりには終えたタスクから1件を選び、選んだ理由を添える。")
  })

  it("昨日・それより前の言い方", () => {
    const yesterday = achievementReflectionRequestText({ ...BASE, date: "2026-09-23" })
    expect(yesterday.startsWith("昨日の成果")).toBe(true)

    const earlier = achievementReflectionRequestText({ ...BASE, date: "2026-09-21" })
    expect(earlier.startsWith("9月21日の成果")).toBe(true)
  })

  it("20件を超えると「ほか n 件」に畳む", () => {
    const items = Array.from({ length: 23 }, (_, index) => ({
      id: `T-${String(index)}`,
      summary: `架空のタスク${String(index)}`,
    }))
    const text = achievementReflectionRequestText({ ...BASE, doneTasks: items })
    expect(text).toContain("- ほか 3 件")
    expect(text.split("\n").filter((line) => line.startsWith("- T-"))).toHaveLength(20)
  })

  it("小さな驚き（卒業・節目）があれば行を足す", () => {
    const text = achievementReflectionRequestText({
      ...BASE,
      graduations: [
        { id: "T-9", summary: "架空の先輩タスク", registeredOn: "2026-09-01", days: 12 },
      ],
      milestones: [{ count: 250, taskId: "T-1" }],
    })
    expect(text).toContain("小さな驚き:")
    expect(text).toContain("- 先輩タスクの卒業: T-9（登録から 12 日）")
    expect(text).toContain("- 節目: 通算 250 件目のタスク")
  })

  it("小さな驚きが無ければ行を出さない", () => {
    expect(achievementReflectionRequestText(BASE)).not.toContain("小さな驚き")
  })

  it("その日に既に日記があれば、続きとして書き足す1行を足す", () => {
    const text = achievementReflectionRequestText({ ...BASE, alreadyWritten: true })
    expect(text).toContain("この日の日記は既にあるので、続きとして書き足す。")
  })
})
