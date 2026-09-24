import { describe, expect, it } from "bun:test"

import {
  kanjiDateLabel,
  kanjiNumeral,
  kanjiWeekdayLabel,
} from "../../../../../src/browser/features/achievement/domain/kanji-date.ts"

describe("kanjiNumeral", () => {
  it("0〜9999の塊を漢数字にする（千・百・十は1のとき数字を置かない）", () => {
    expect(kanjiNumeral(0)).toBe("〇")
    expect(kanjiNumeral(9)).toBe("九")
    expect(kanjiNumeral(10)).toBe("十")
    expect(kanjiNumeral(16)).toBe("十六")
    expect(kanjiNumeral(23)).toBe("二十三")
    expect(kanjiNumeral(100)).toBe("百")
    expect(kanjiNumeral(250)).toBe("二百五十")
    expect(kanjiNumeral(500)).toBe("五百")
    expect(kanjiNumeral(750)).toBe("七百五十")
    expect(kanjiNumeral(1000)).toBe("千")
    expect(kanjiNumeral(2000)).toBe("二千")
  })

  it("万は1でも頭に数字を置く", () => {
    expect(kanjiNumeral(10000)).toBe("一万")
    expect(kanjiNumeral(12500)).toBe("一万二千五百")
  })
})

describe("kanjiDateLabel / kanjiWeekdayLabel", () => {
  it("「九月十六日」「水曜日」の形になる", () => {
    const date = Temporal.PlainDate.from("2026-09-16")
    expect(kanjiDateLabel(date)).toBe("九月十六日")
    expect(kanjiWeekdayLabel(date)).toBe("水曜日")
  })

  it("「九月二十三日」の形になる（2桁の日）", () => {
    expect(kanjiDateLabel(Temporal.PlainDate.from("2026-09-23"))).toBe("九月二十三日")
  })
})
