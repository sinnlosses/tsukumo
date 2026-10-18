import { afterEach, describe, expect, it, vi } from "vitest"

import {
  loadBeforeAfterView,
  saveBeforeAfterView,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/before-after-view.ts"

const STORAGE_KEY = "tsukumo-before-after-view:v1"

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(STORAGE_KEY)
})

describe("loadBeforeAfterView", () => {
  it("何も保存していなければ並べるを返す", () => {
    expect(loadBeforeAfterView()).toBe("side")
  })

  it("保存した見せ方を読み戻す", () => {
    saveBeforeAfterView("switch")
    expect(loadBeforeAfterView()).toBe("switch")
    saveBeforeAfterView("side")
    expect(loadBeforeAfterView()).toBe("side")
  })

  it("知らない値は並べるへ畳む", () => {
    localStorage.setItem(STORAGE_KEY, "stacked")
    expect(loadBeforeAfterView()).toBe("side")
  })

  it("読み出しが投げても並べるを返す", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("読めない")
    })
    expect(loadBeforeAfterView()).toBe("side")
  })

  it("書き込みが投げても例外を出さない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("書けない")
    })
    expect(() => {
      saveBeforeAfterView("switch")
    }).not.toThrow()
  })
})
