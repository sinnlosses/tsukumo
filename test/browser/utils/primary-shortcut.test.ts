import { describe, expect, it } from "vitest"

import {
  matchesPrimaryShortcut,
  type ShortcutEvent,
} from "../../../src/browser/utils/primary-shortcut.ts"

function press(overrides: Partial<ShortcutEvent>): ShortcutEvent {
  return {
    key: "k",
    code: "KeyK",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides,
  }
}

const K = { code: "KeyK" } as const
const DOT = { key: "." } as const

describe("matchesPrimaryShortcut", () => {
  it("Mac では ⌘K だけが当たる", () => {
    expect(matchesPrimaryShortcut(press({ metaKey: true }), K, true)).toBe(true)
    expect(matchesPrimaryShortcut(press({ ctrlKey: true }), K, true)).toBe(false)
    expect(matchesPrimaryShortcut(press({ metaKey: true, ctrlKey: true }), K, true)).toBe(false)
  })

  it("Mac 以外では Ctrl+K だけが当たる", () => {
    expect(matchesPrimaryShortcut(press({ ctrlKey: true }), K, false)).toBe(true)
    expect(matchesPrimaryShortcut(press({ metaKey: true }), K, false)).toBe(false)
    expect(matchesPrimaryShortcut(press({ metaKey: true, ctrlKey: true }), K, false)).toBe(false)
  })

  it("Alt や Shift が余分に付いたら当たらない", () => {
    expect(matchesPrimaryShortcut(press({ metaKey: true, altKey: true }), K, true)).toBe(false)
    expect(matchesPrimaryShortcut(press({ metaKey: true, shiftKey: true }), K, true)).toBe(false)
  })

  it("変換中は当たらない", () => {
    expect(matchesPrimaryShortcut(press({ metaKey: true, isComposing: true }), K, true)).toBe(false)
  })

  it("code で指せば配列で key が変わっても当たる", () => {
    expect(matchesPrimaryShortcut(press({ metaKey: true, key: "ん" }), K, true)).toBe(true)
    expect(matchesPrimaryShortcut(press({ metaKey: true, code: "KeyJ" }), K, true)).toBe(false)
  })

  it("key で指せば code の名前では当たらず、同じ規則で修飾キーを見る", () => {
    const dot = { key: ".", code: "Period" }
    expect(matchesPrimaryShortcut(press({ ...dot, metaKey: true }), DOT, true)).toBe(true)
    expect(matchesPrimaryShortcut(press({ ...dot, ctrlKey: true }), DOT, true)).toBe(false)
    expect(matchesPrimaryShortcut(press({ ...dot, ctrlKey: true }), DOT, false)).toBe(true)
    expect(matchesPrimaryShortcut(press({ ...dot, metaKey: true }), DOT, false)).toBe(false)
  })

  it("code の名前を key で、字を key で指しても欄は取り違えない", () => {
    const slash = { key: "/", code: "Slash", metaKey: true }
    expect(matchesPrimaryShortcut(press(slash), { code: "Slash" }, true)).toBe(true)
    expect(matchesPrimaryShortcut(press(slash), { key: "Slash" }, true)).toBe(false)
    expect(matchesPrimaryShortcut(press({ metaKey: true }), { key: "k" }, true)).toBe(true)
    expect(matchesPrimaryShortcut(press({ metaKey: true, key: "ん" }), { key: "k" }, true)).toBe(
      false,
    )
  })
})
