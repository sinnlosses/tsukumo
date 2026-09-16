import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { loadPortraitFixed, savePortraitFixed } from "../../../src/ui/lib/portrait-fixed.ts"

const STORAGE_KEY = "tsukumo-portrait-fixed"

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe("loadPortraitFixed", () => {
  it("既定は可動（false）", () => {
    expect(loadPortraitFixed()).toBe(false)
  })

  it("保存した値をそのまま読み戻す", () => {
    savePortraitFixed(true)
    expect(loadPortraitFixed()).toBe(true)
  })

  it("壊れた JSON は既定（可動）へ落ちる", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadPortraitFixed()).toBe(false)
  })

  it("真偽値でない値は既定（可動）へ落ちる", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("yes"))
    expect(loadPortraitFixed()).toBe(false)
  })
})
