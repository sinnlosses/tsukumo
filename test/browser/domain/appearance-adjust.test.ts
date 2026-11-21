import { describe, expect, it } from "vitest"

import { appearanceAdjustTokenWrites } from "../../../src/browser/domain/appearance-adjust.ts"
import { foldGearPreferences } from "../../../src/shared/session/gear-preference.ts"

describe("appearance-adjust の覚えた値の読み戻し", () => {
  const UNTOUCHED = { veil: undefined, blur: 12, fill: 45 }

  it.each([
    ["覚えた値が無い", undefined, UNTOUCHED],
    ["範囲の中の値", { veil: 0.85, blur: 10, fill: 60 }, { veil: 0.85, blur: 10, fill: 60 }],
    [
      "範囲の外の値は端に収める",
      { veil: 0.5, blur: 40, fill: 95 },
      { veil: 0.7, blur: 24, fill: 90 },
    ],
    ["範囲の外の値（下側）", { veil: 5, blur: -3, fill: 2 }, { veil: 1, blur: 0, fill: 20 }],
    ["オブジェクトでない", "x", UNTOUCHED],
    ["文字列の項", { veil: "0.9", blur: "x", fill: "y" }, UNTOUCHED],
    [
      "1項が壊れても他は生かす",
      { veil: "bad", blur: 16, fill: 70 },
      { veil: undefined, blur: 16, fill: 70 },
    ],
    ["欠けた項", { blur: 4 }, { veil: undefined, blur: 4, fill: 45 }],
  ])("%s", (_name, raw, expected) => {
    expect(foldGearPreferences({ appearanceAdjust: raw }).values.appearanceAdjust).toEqual(expected)
  })
})

describe("appearanceAdjustTokenWrites", () => {
  it("動かしていない背景の暗さはトークンを外す", () => {
    const writes = appearanceAdjustTokenWrites({ veil: undefined, blur: 12, fill: 45 })
    expect(writes).toEqual([
      { name: "--character-background-veil-user", value: undefined },
      { name: "--panel-blur-user", value: "12px" },
      { name: "--panel-fill-user", value: "45%" },
    ])
  })

  it("動かした値を差す", () => {
    const writes = appearanceAdjustTokenWrites({ veil: 0.9, blur: 0, fill: 20 })
    expect(writes.map((write) => write.value)).toEqual(["0.9", "0px", "20%"])
  })
})
