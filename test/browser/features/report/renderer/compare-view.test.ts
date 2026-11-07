import { afterEach, describe, expect, it, vi } from "vitest"

import {
  loadCompareView,
  saveCompareView,
} from "../../../../../src/browser/features/report/renderer/compare-view.ts"

const STORAGE_KEY = "tsukumo-compare-view:v1"

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(STORAGE_KEY)
})

describe("loadCompareView", () => {
  it("何も保存していなければ並べるを返す", () => {
    expect(loadCompareView()).toBe("side")
  })

  it("保存した見せ方を読み戻す", () => {
    saveCompareView("switch")
    expect(loadCompareView()).toBe("switch")
    saveCompareView("overlay")
    expect(loadCompareView()).toBe("overlay")
    saveCompareView("side")
    expect(loadCompareView()).toBe("side")
  })

  it("知らない値は並べるへ畳む", () => {
    localStorage.setItem(STORAGE_KEY, "stacked")
    expect(loadCompareView()).toBe("side")
  })

  it("読み出しが投げても並べるを返す", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("読めない")
    })
    expect(loadCompareView()).toBe("side")
  })

  it("書き込みが投げても例外を出さない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("書けない")
    })
    expect(() => {
      saveCompareView("switch")
    }).not.toThrow()
  })
})
