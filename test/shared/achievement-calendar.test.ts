import { describe, expect, it } from "bun:test"

import { achievementCalendarDateKeys, lampLevel } from "../../src/shared/achievement-calendar.ts"

// ここで使う日付・数はすべて手で書いた架空のもの（実物の履歴の記録は使わない）。

describe("achievementCalendarDateKeys", () => {
  it("今日を含む週の月曜から4週前の月曜〜今日を、古い順で返す", () => {
    // 木曜を「今日」とする（dayOfWeek=4）。今週の月曜から、その4週前の月曜までが範囲。
    const dateKeys = achievementCalendarDateKeys("2026-09-24")

    expect(dateKeys[0]).toBe("2026-08-24")
    expect(dateKeys.at(-1)).toBe("2026-09-24")
    expect(dateKeys).toHaveLength(32)
    expect(dateKeys).toEqual([...dateKeys].sort())
  })

  it("今日が月曜のときは、その日を含む週の月曜（今日そのもの）から4週前の月曜まで", () => {
    // 月曜を「今日」とする（dayOfWeek=1）。
    const dateKeys = achievementCalendarDateKeys("2026-09-21")

    expect(dateKeys[0]).toBe("2026-08-24")
    expect(dateKeys.at(-1)).toBe("2026-09-21")
    expect(dateKeys).toHaveLength(29)
  })
})

describe("lampLevel", () => {
  it("0件は灯りなし", () => {
    expect(lampLevel(0)).toBe("none")
  })

  it("1〜9件はほのか", () => {
    expect(lampLevel(1)).toBe("faint")
    expect(lampLevel(9)).toBe("faint")
  })

  it("10〜39件はともる", () => {
    expect(lampLevel(10)).toBe("lit")
    expect(lampLevel(39)).toBe("lit")
  })

  it("40件以上は明るい", () => {
    expect(lampLevel(40)).toBe("bright")
    expect(lampLevel(1000)).toBe("bright")
  })
})
