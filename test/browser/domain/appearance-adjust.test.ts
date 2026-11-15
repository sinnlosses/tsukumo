import { afterEach, describe, expect, it } from "vitest"

import {
  appearanceAdjustTokenWrites,
  loadAppearanceAdjust,
  type AppearanceAdjust,
} from "../../../src/browser/domain/appearance-adjust.ts"

const STORAGE_KEY = "tsukumo-appearance-adjust:v1"

afterEach(() => {
  localStorage.clear()
})

function loadStored(raw?: string): AppearanceAdjust {
  if (raw !== undefined) {
    localStorage.setItem(STORAGE_KEY, raw)
  }
  return loadAppearanceAdjust()
}

describe("appearance-adjust の読み戻し", () => {
  const UNTOUCHED = { veil: undefined, blur: 8, fill: 45 }

  it.each([
    ["保存が無い", undefined, UNTOUCHED],
    [
      "範囲の中の値",
      JSON.stringify({ veil: 0.85, blur: 12, fill: 60 }),
      { veil: 0.85, blur: 12, fill: 60 },
    ],
    [
      "範囲の外の値は端に収める",
      JSON.stringify({ veil: 0.5, blur: 40, fill: 95 }),
      { veil: 0.7, blur: 24, fill: 90 },
    ],
    [
      "範囲の外の値（下側）",
      JSON.stringify({ veil: 5, blur: -3, fill: 2 }),
      { veil: 1, blur: 0, fill: 20 },
    ],
    ["壊れた JSON", "{not json", UNTOUCHED],
    ["オブジェクトでない", JSON.stringify("x"), UNTOUCHED],
    ["文字列の項", JSON.stringify({ veil: "0.9", blur: "x", fill: "y" }), UNTOUCHED],
    [
      "1項が壊れても他は生かす",
      JSON.stringify({ veil: "bad", blur: 16, fill: 70 }),
      { veil: undefined, blur: 16, fill: 70 },
    ],
    ["欠けた項", JSON.stringify({ blur: 4 }), { veil: undefined, blur: 4, fill: 45 }],
  ])("%s", (_name, raw, expected) => {
    expect(loadStored(raw)).toEqual(expected)
  })
})

describe("appearanceAdjustTokenWrites", () => {
  it("動かしていない背景の暗さはトークンを外す", () => {
    const writes = appearanceAdjustTokenWrites({ veil: undefined, blur: 8, fill: 45 })
    expect(writes).toEqual([
      { name: "--character-background-veil-user", value: undefined },
      { name: "--panel-blur-user", value: "8px" },
      { name: "--panel-fill-user", value: "45%" },
    ])
  })

  it("動かした値を差す", () => {
    const writes = appearanceAdjustTokenWrites({ veil: 0.9, blur: 0, fill: 20 })
    expect(writes.map((write) => write.value)).toEqual(["0.9", "0px", "20%"])
  })
})
