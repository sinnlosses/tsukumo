import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadRevealSpeed, saveRevealSpeed } from "../../../src/browser/domain/reveal-speed.ts"

const STORAGE_KEY = "tsukumo-reveal-speed:v1"

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe("loadRevealSpeed", () => {
  it("何も保存していなければ既定（standard）を返す", () => {
    expect(loadRevealSpeed()).toBe("standard")
  })

  it("保存した値をそのまま読み戻す", () => {
    saveRevealSpeed("fast")
    expect(loadRevealSpeed()).toBe("fast")
  })

  it("知らない値は既定へ畳む", () => {
    localStorage.setItem(STORAGE_KEY, "very-fast")
    expect(loadRevealSpeed()).toBe("standard")
  })
})
