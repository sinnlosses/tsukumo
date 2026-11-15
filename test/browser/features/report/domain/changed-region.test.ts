import { describe, expect, it } from "vitest"

import { findChangedRegion } from "../../../../../src/browser/features/report/domain/changed-region.ts"

const SIZE = 10

const NONE = { kind: "none" }

function blank(): Uint8ClampedArray {
  return new Uint8ClampedArray(SIZE * SIZE * 4).fill(255)
}

function paint(pixels: Uint8ClampedArray, x: number, y: number, width: number, height: number) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const offset = (row * SIZE + column) * 4
      pixels[offset] = 0
      pixels[offset + 1] = 0
      pixels[offset + 2] = 0
    }
  }
}

describe("変わった範囲の枠", () => {
  it("同じ画なら枠を返さない", () => {
    expect(findChangedRegion(blank(), blank(), SIZE, SIZE)).toEqual(NONE)
  })

  it("色の差が許す幅に収まる揺れは変わったとみなさない", () => {
    const after = blank().fill(240)
    expect(findChangedRegion(blank(), after, SIZE, SIZE)).toEqual(NONE)
  })

  it("1か所が違えば、その範囲を%で返す", () => {
    const after = blank()
    paint(after, 2, 3, 3, 2)
    expect(findChangedRegion(blank(), after, SIZE, SIZE)).toEqual({
      kind: "region",
      region: { left: 20, top: 30, width: 30, height: 20 },
    })
  })

  it("離れた2か所が違えば、両方を含む1つの枠を返す", () => {
    const after = blank()
    paint(after, 1, 1, 1, 1)
    paint(after, 5, 4, 2, 1)
    expect(findChangedRegion(blank(), after, SIZE, SIZE)).toEqual({
      kind: "region",
      region: { left: 10, top: 10, width: 60, height: 40 },
    })
  })

  it("枠が画の面積の半分を超えるなら枠を返さない", () => {
    const after = blank()
    paint(after, 0, 0, SIZE, 6)
    expect(findChangedRegion(blank(), after, SIZE, SIZE)).toEqual(NONE)
  })

  it("枠がちょうど半分なら枠を返す", () => {
    const after = blank()
    paint(after, 0, 0, SIZE, 5)
    expect(findChangedRegion(blank(), after, SIZE, SIZE)).toEqual({
      kind: "region",
      region: { left: 0, top: 0, width: 100, height: 50 },
    })
  })

  it("画素の並びの長さが幅と高さに合わなければ枠を返さない", () => {
    expect(findChangedRegion(blank(), new Uint8ClampedArray(8), SIZE, SIZE)).toEqual(NONE)
  })
})
