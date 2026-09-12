import { describe, expect, it } from "bun:test"

import { resolveOpenView } from "../../src/infrastructure/auto-open-view.ts"

describe("resolveOpenView", () => {
  it("未設定なら開く", () => {
    expect(resolveOpenView(undefined)).toBe(true)
  })

  it('"0" のときだけ開かない', () => {
    expect(resolveOpenView("0")).toBe(false)
    expect(resolveOpenView(" 0 ")).toBe(false)
  })

  it('"0" 以外の値はすべて開く', () => {
    expect(resolveOpenView("1")).toBe(true)
    expect(resolveOpenView("false")).toBe(true)
    expect(resolveOpenView("")).toBe(true)
  })
})
