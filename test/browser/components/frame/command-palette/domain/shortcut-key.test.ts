import { describe, expect, it } from "vitest"

import {
  shortcutOf,
  type ShortcutKeyEvent,
} from "../../../../../../src/browser/components/frame/command-palette/domain/shortcut-key.ts"

function press(key: string, rest: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    target: undefined,
    ...rest,
  }
}

describe("画面全体のショートカット", () => {
  it("⌘ と英字・⌘, で操作を引く", () => {
    expect(shortcutOf(press("k", { metaKey: true }))).toBe("command-palette")
    expect(shortcutOf(press("J", { metaKey: true }))).toBe("session-switcher")
    expect(shortcutOf(press("e", { metaKey: true }))).toBe("task-board")
    expect(shortcutOf(press(",", { metaKey: true }))).toBe("settings")
  })

  it("Ctrl・Option・Shift を伴う押し方は入力欄のカーソル移動とブラウザに譲る", () => {
    expect(shortcutOf(press("k", { ctrlKey: true }))).toBe("none")
    expect(shortcutOf(press("k", { metaKey: true, ctrlKey: true }))).toBe("none")
    expect(shortcutOf(press("k", { metaKey: true, altKey: true }))).toBe("none")
    expect(shortcutOf(press("k", { metaKey: true, shiftKey: true }))).toBe("none")
  })

  it("割り当てていない ⌘ のキーと変換中は読まない", () => {
    expect(shortcutOf(press("c", { metaKey: true }))).toBe("none")
    expect(shortcutOf(press("k", { metaKey: true, isComposing: true }))).toBe("none")
  })

  it("/ は打っていないときだけ入力欄へ移る", () => {
    const field = document.createElement("textarea")
    expect(shortcutOf(press("/"))).toBe("composer")
    expect(shortcutOf(press("/", { target: field }))).toBe("none")
  })
})
