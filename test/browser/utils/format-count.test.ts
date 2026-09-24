import { describe, expect, it } from "bun:test"

import { formatCount, round } from "../../../src/browser/utils/format-count.ts"

describe("formatCount", () => {
  it("1000未満はそのまま", () => {
    expect(formatCount(999)).toBe("999")
  })

  it("1000以上は k を付ける", () => {
    expect(formatCount(60_000)).toBe("60.0k")
  })

  it("100万以上は M を付ける", () => {
    expect(formatCount(1_230_000)).toBe("1.23M")
  })
})

describe("round", () => {
  it("100以上は整数", () => {
    expect(round(123.4)).toBe("123")
  })

  it("10以上100未満は小数第1位", () => {
    expect(round(12.34)).toBe("12.3")
  })

  it("10未満は小数第2位", () => {
    expect(round(1.234)).toBe("1.23")
  })
})
