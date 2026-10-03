import { describe, expect, it } from "vitest"

import {
  welcomeKeyOf,
  type WelcomeKeyEvent,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/welcome/domain/welcome-key.ts"

function press(key: string, rest: Partial<WelcomeKeyEvent> = {}): WelcomeKeyEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isComposing: false,
    target: null,
    ...rest,
  }
}

describe("迎える口のキー", () => {
  it("1〜3 は札、/ は入力欄、← は前のやり取り", () => {
    expect(welcomeKeyOf(press("1"))).toEqual({ kind: "card", index: 0 })
    expect(welcomeKeyOf(press("3"))).toEqual({ kind: "card", index: 2 })
    expect(welcomeKeyOf(press("/"))).toEqual({ kind: "write" })
    expect(welcomeKeyOf(press("ArrowLeft"))).toEqual({ kind: "previous" })
  })

  it("ほかのキーは読まない", () => {
    expect(welcomeKeyOf(press("4"))).toBeUndefined()
    expect(welcomeKeyOf(press("a"))).toBeUndefined()
  })

  it("修飾キー付き・変換中は読まない", () => {
    expect(welcomeKeyOf(press("1", { metaKey: true }))).toBeUndefined()
    expect(welcomeKeyOf(press("ArrowLeft", { altKey: true }))).toBeUndefined()
    expect(welcomeKeyOf(press("1", { isComposing: true }))).toBeUndefined()
  })
})
