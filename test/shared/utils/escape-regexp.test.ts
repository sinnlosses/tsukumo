import { describe, expect, it } from "vitest"

import { escapeRegExp } from "../../../src/shared/utils/escape-regexp.ts"

describe("escapeRegExp", () => {
  it("メタ文字を打ち消し、文字どおりに当たる", () => {
    const escaped = escapeRegExp("a.b*(c)[d]\\")
    expect(escaped).toBe("a\\.b\\*\\(c\\)\\[d\\]\\\\")
    expect(new RegExp(`^${escaped}$`).test("a.b*(c)[d]\\")).toBe(true)
  })

  it("メタ文字のない文字列はそのまま", () => {
    expect(escapeRegExp("あいう-abc")).toBe("あいう-abc")
  })
})
