import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import {
  DEFAULT_REVEAL_SPEED,
  isRevealSpeed,
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
    expect(loadRevealSpeed()).toBe(DEFAULT_REVEAL_SPEED)
    expect(DEFAULT_REVEAL_SPEED).toBe("standard")
  })

  it("保存した値をそのまま読み戻す", () => {
    saveRevealSpeed("fast")
    expect(loadRevealSpeed()).toBe("fast")
  })

  it("「切る」も読み戻せる", () => {
    saveRevealSpeed("off")
    expect(loadRevealSpeed()).toBe("off")
  })

  it("知らない値は既定へ畳む", () => {
    localStorage.setItem(STORAGE_KEY, "very-fast")
    expect(loadRevealSpeed()).toBe(DEFAULT_REVEAL_SPEED)
  })
})

describe("isRevealSpeed", () => {
  it("standard / fast / off だけを受け取る", () => {
    expect(isRevealSpeed("standard")).toBe(true)
    expect(isRevealSpeed("fast")).toBe(true)
    expect(isRevealSpeed("off")).toBe(true)
    expect(isRevealSpeed("very-fast")).toBe(false)
  })
})

describe("revealTimingOf", () => {
  it("fast は standard より文字1つあたりの時間が短い（速い）", () => {
    const standard = revealTimingOf("standard")
    const fast = revealTimingOf("fast")

    expect(fast.msPerCharacter).toBeLessThan(standard.msPerCharacter)
  })

  it("fast は standard より塊の上限・下限も短い（短い塊でも下限に張り付いたまま速さが変わらない、を避ける）", () => {
    const standard = revealTimingOf("standard")
    const fast = revealTimingOf("fast")

    expect(fast.minBlockMs).toBeLessThan(standard.minBlockMs)
    expect(fast.maxBlockMs).toBeLessThan(standard.maxBlockMs)
  })
})
