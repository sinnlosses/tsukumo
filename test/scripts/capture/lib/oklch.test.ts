import { describe, expect, test } from "vitest"

import { srgbToOklch } from "../../../../scripts/capture/lib/oklch.ts"

describe("srgbToOklch", () => {
  test("黒・白・灰は彩度がほぼ 0", () => {
    expect(srgbToOklch(0, 0, 0).chroma).toBeLessThan(1e-3)
    expect(srgbToOklch(255, 255, 255).chroma).toBeLessThan(1e-3)
    expect(srgbToOklch(128, 128, 128).chroma).toBeLessThan(1e-3)
    expect(srgbToOklch(255, 255, 255).lightness).toBeCloseTo(1, 2)
  })

  test("純赤・純緑・純青は既知の OKLCH の近傍", () => {
    const red = srgbToOklch(255, 0, 0)
    expect(red.hue).toBeCloseTo(29.2, 0)
    expect(red.chroma).toBeCloseTo(0.2577, 2)
    expect(srgbToOklch(0, 255, 0).hue).toBeCloseTo(142.5, 0)
    expect(srgbToOklch(0, 0, 255).hue).toBeCloseTo(264.05, 0)
  })
})
