import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"

import {
  navigateTo,
  usePackHref,
  usePackSelection,
  useScreen,
  useScreenHref,
} from "../../../src/browser/stores/screen.tsx"

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

  it("見ているターンが乗っていても画面は読める", () => {
    window.location.hash = "#character?turn=3"
    expect(renderHook(() => useScreen()).result.current).toBe("character")

    window.location.hash = "#?turn=3"
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
  it("見ているターンは消さずに運ぶ", () => {
    window.location.hash = "#?turn=3"

    navigateTo("character")
    expect(window.location.hash).toBe("#character?turn=3")

    navigateTo("conversation")
    expect(window.location.hash).toBe("#?turn=3")
  })

  it("hash を書き換える（会話の画面は hash 無しに戻る）", () => {
    navigateTo("character")
    expect(window.location.hash).toBe("#character")

    navigateTo("character-create")
    expect(window.location.hash).toBe("#character/new")

    navigateTo("conversation")
    expect(window.location.hash).toBe("")
  })
})

describe("useScreenHref", () => {
  // リンクの `href` に空文字を書くとページの再読み込みになるので、会話の画面は "#"。
  it("リンクに書ける href を返す", () => {
    const { result } = renderHook(() => useScreenHref())

    expect(result.current("conversation")).toBe("#")
    expect(result.current("character")).toBe("#character")
    expect(result.current("character-create")).toBe("#character/new")
  })

  it("見ているターンを hash に残したまま画面を移す href になる", () => {
    window.location.hash = "#?turn=3"
    const { result } = renderHook(() => useScreenHref())

    expect(result.current("character")).toBe("#character?turn=3")

    goToHash("#character?turn=5")
    expect(result.current("conversation")).toBe("#?turn=5")
  })
})

describe("usePackSelection", () => {
  it("pack が無ければ使用中、あればその名前を選んでいる", () => {
    window.location.hash = "#character"
    const { result } = renderHook(() => usePackSelection())
    expect(result.current).toEqual({ kind: "in-use" })

    goToHash("#character?pack=other")
    expect(result.current).toEqual({ kind: "named", name: "other" })
  })
})

describe("usePackHref", () => {
  it("そのパックを選ぶキャラクター画面の href を、見ているターンを残して作る", () => {
    window.location.hash = "#character?turn=3"
    const { result } = renderHook(() => usePackHref())

    expect(result.current("other")).toBe("#character?pack=other&turn=3")
  })

  // 帯の「キャラクター」から入り直したときは使用中のパックから（選んだパックは運ばない）。
  it("画面の href は選んでいるパックを落とす", () => {
    window.location.hash = "#character?pack=other"
    const { result } = renderHook(() => useScreenHref())

    expect(result.current("character")).toBe("#character")
  })
})
