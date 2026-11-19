import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { saveMotionPreference } from "../../../../src/browser/domain/motion-preference.ts"
import { prefersReducedMotion } from "../../../../src/browser/domain/reveal/reduced-motion.ts"

const KEY = "tsukumo-motion-preference:v1"

beforeEach(() => {
  localStorage.removeItem(KEY)
})

afterEach(() => {
  localStorage.removeItem(KEY)
})

const os = (matches: boolean) => () => ({ matches })

describe("prefersReducedMotion", () => {
  it("好みが無ければ OS の設定のとおり", () => {
    expect(prefersReducedMotion(os(false))).toBe(false)
    expect(prefersReducedMotion(os(true))).toBe(true)
  })

  it("「減らす」なら OS の設定が無くても真", () => {
    saveMotionPreference("reduce")
    expect(prefersReducedMotion(os(false))).toBe(true)
  })

  it("「OS の設定に従う」を保存してもいまと同じ結果", () => {
    saveMotionPreference("system")
    expect(prefersReducedMotion(os(false))).toBe(false)
    expect(prefersReducedMotion(os(true))).toBe(true)
  })

  it("知らない値は OS の設定に畳む", () => {
    localStorage.setItem(KEY, "bogus")
    expect(prefersReducedMotion(os(false))).toBe(false)
  })
})
