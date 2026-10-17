import { describe, expect, test } from "vitest"

import { hueFamilies, srgbToOklch } from "../../../scripts/capture/lib/paper-hue.ts"

/** 色ごとに `count` 画素ずつ並べた画。 */
function filled(colors: readonly (readonly [number, number, number, number])[]) {
  const flat = colors.flatMap(([r, g, b, count]) =>
    Array.from({ length: count }, () => [r, g, b, 255]).flat(),
  )
  return { width: flat.length / 4, height: 1, pixels: Uint8Array.from(flat) }
}

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

describe("hueFamilies", () => {
  test("赤だけの画は 1 族", () => {
    expect([...hueFamilies(filled([[255, 0, 0, 100]])).keys()]).toStrictEqual([0])
  })

  test("赤と青の画は 2 族で、度の昇順", () => {
    expect([
      ...hueFamilies(
        filled([
          [0, 0, 255, 100],
          [255, 0, 0, 100],
        ]),
      ).keys(),
    ]).toStrictEqual([0, 240])
  })

  test("灰と白だけの画は 0 族", () => {
    expect(
      hueFamilies(
        filled([
          [128, 128, 128, 100],
          [255, 255, 255, 100],
        ]),
      ).size,
    ).toBe(0)
  })

  test("彩度が閾値の下の淡い色は数えない", () => {
    expect(hueFamilies(filled([[240, 236, 236, 100]])).size).toBe(0)
  })

  test("画素が 30 未満の族は外れ、30 ちょうどは残る", () => {
    const families = hueFamilies(
      filled([
        [255, 0, 0, 30],
        [0, 0, 255, 29],
      ]),
    )
    expect([...families.keys()]).toStrictEqual([0])
  })

  test("同じ 30° の中の近い色相は 1 族に畳まれ、画素数は合算される", () => {
    const families = hueFamilies(
      filled([
        [255, 0, 0, 20],
        [230, 10, 20, 20],
      ]),
    )
    expect(families.size).toBe(1)
    expect(families.get(0)).toBe(40)
  })
})
