import { afterEach, describe, expect, it } from "vitest"

import { loadSingleKeys, saveSingleKeys } from "../../../src/browser/stores/single-key-setting.ts"

afterEach(() => {
  localStorage.clear()
})

describe("1字のキーの設定", () => {
  it("何も保存していなければ入", () => {
    expect(loadSingleKeys()).toBe(true)
  })

  it("保存した値を読み返す", () => {
    saveSingleKeys(false)
    expect(loadSingleKeys()).toBe(false)
    saveSingleKeys(true)
    expect(loadSingleKeys()).toBe(true)
  })

  it("壊れた値は入へ戻る", () => {
    localStorage.setItem("tsukumo-single-key:v1", "{壊れた")
    expect(loadSingleKeys()).toBe(true)
    localStorage.setItem("tsukumo-single-key:v1", '"no"')
    expect(loadSingleKeys()).toBe(true)
  })
})
