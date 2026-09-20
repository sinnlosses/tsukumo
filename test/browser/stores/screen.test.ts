import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"

import { navigateTo, screenHash, useScreen } from "../../../src/browser/stores/screen.tsx"

/**
 * hash を書き換えて `hashchange` を流す。happy-dom が `location.hash` の代入でイベントを
 * 出すかは実装依存なので、**このテストは自分で流す**（本物のブラウザは必ず出す）。
 */
function goToHash(hash: string): void {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new Event("hashchange"))
  })
}

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

describe("useScreen", () => {
  it("hash が無ければ会話の画面", () => {
    window.location.hash = ""

    const { result } = renderHook(() => useScreen())

    expect(result.current).toBe("conversation")
  })

  it("#character はキャラクター画面、#character/new は作る画面", () => {
    window.location.hash = "#character"
    expect(renderHook(() => useScreen()).result.current).toBe("character")

    window.location.hash = "#character/new"
    expect(renderHook(() => useScreen()).result.current).toBe("character-create")
  })

  it("知らない hash は会話の画面に落ちる", () => {
    window.location.hash = "#nowhere"

    expect(renderHook(() => useScreen()).result.current).toBe("conversation")
  })

  it("hashchange で読み直す", () => {
    window.location.hash = ""
    const { result } = renderHook(() => useScreen())

    goToHash("#character")
    expect(result.current).toBe("character")

    goToHash("#character/new")
    expect(result.current).toBe("character-create")

    goToHash("")
    expect(result.current).toBe("conversation")
  })
})

describe("navigateTo", () => {
  it("hash を書き換える（会話の画面は hash 無しに戻る）", () => {
    navigateTo("character")
    expect(window.location.hash).toBe("#character")

    navigateTo("character-create")
    expect(window.location.hash).toBe("#character/new")

    navigateTo("conversation")
    expect(window.location.hash).toBe("")
  })
})

describe("screenHash", () => {
  // リンクの `href` に空文字を書くとページの再読み込みになるので、会話の画面は "#"。
  it("リンクに書ける href を返す", () => {
    expect(screenHash("conversation")).toBe("#")
    expect(screenHash("character")).toBe("#character")
    expect(screenHash("character-create")).toBe("#character/new")
  })
})
