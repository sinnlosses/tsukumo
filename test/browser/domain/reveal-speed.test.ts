import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  loadRevealSpeed,
  revealTimingOf,
  saveRevealSpeed,
} from "../../../src/browser/domain/reveal-speed.ts"

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

describe("revealTimingOf", () => {
  it("fast は standard より文字1つあたりの時間も、塊の上限・下限も短い（短い塊でも下限に張り付いたまま速さが変わらない、を避ける）", () => {
    const standard = revealTimingOf("standard")
    const fast = revealTimingOf("fast")

    expect(fast.msPerCharacter).toBeLessThan(standard.msPerCharacter)
    expect(fast.minBlockMs).toBeLessThan(standard.minBlockMs)
    expect(fast.maxBlockMs).toBeLessThan(standard.maxBlockMs)
  })
})
