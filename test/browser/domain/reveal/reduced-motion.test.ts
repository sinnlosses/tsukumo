import { describe, expect, it } from "vitest"

import { prefersReducedMotion } from "../../../../src/browser/domain/reveal/reduced-motion.ts"

const os = (matches: boolean) => () => ({ matches })

describe("prefersReducedMotion", () => {
  it("「OS の設定に従う」なら OS の設定のとおり", () => {
    expect(prefersReducedMotion(os(false), "system")).toBe(false)
    expect(prefersReducedMotion(os(true), "system")).toBe(true)
  })

  it("「減らす」なら OS の設定が無くても真", () => {
    expect(prefersReducedMotion(os(false), "reduce")).toBe(true)
  })
})
