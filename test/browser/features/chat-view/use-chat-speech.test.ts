import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"

import { useChatSpeech } from "../../../../src/browser/features/chat-view/hooks/use-chat-speech.ts"

/**
 * セリフの行（`components/chat-speech.tsx`）を描かずに、押し方の読み替え——ドラッグとの見分け・
 * 遡るキー・育っている最中の打ち切り——だけを測る（docs/design.md 2章「機能の中を分ける」）。
 * 文面は手で書いた架空のもの。
 */

afterEach(() => {
  cleanup()
})

type Toggled = { count: number }

function renderSpeech(grow: boolean): {
  readonly toggled: Toggled
  readonly result: { readonly current: ReturnType<typeof useChatSpeech> }
} {
  const toggled: Toggled = { count: 0 }
  const { result } = renderHook(() =>
    useChatSpeech("架空のセリフ", grow, () => {
      toggled.count += 1
    }),
  )
  return { toggled, result }
}

/** 押し始めから手を離すまで。`moveX` だけ横に動かすとドラッグで文字を選んだことになる。 */
function press(view: ReturnType<typeof useChatSpeech>, moveX: number, detail = 1): void {
  view.onMouseDown({ clientX: 20, clientY: 30, detail })
  view.onClick({ clientX: 20 + moveX, clientY: 30, detail })
}

function key(value: string): {
  readonly key: string
  readonly preventDefault: () => void
  prevented: () => boolean
} {
  let prevented = false
  return {
    key: value,
    preventDefault: () => {
      prevented = true
    },
    prevented: () => prevented,
  }
}

describe("useChatSpeech の押し方", () => {
  it("手が動いていない押しは遡る", () => {
    const { toggled, result } = renderSpeech(false)

    press(result.current, 0)

    expect(toggled.count).toBe(1)
  })

  it("数pxのぶれなら遡り、それを超えて動いたらドラッグとして遡らない", () => {
    const { toggled, result } = renderSpeech(false)

    press(result.current, 4)
    expect(toggled.count).toBe(1)

    press(result.current, 5)
    expect(toggled.count).toBe(1)
  })

  it("マウスから来ていない click（detail 0）は動いた距離に関わらず遡る", () => {
    const { toggled, result } = renderSpeech(false)

    press(result.current, 100, 0)

    expect(toggled.count).toBe(1)
  })

  it("押し始めが無い click は押したものとして遡る", () => {
    const { toggled, result } = renderSpeech(false)

    result.current.onClick({ clientX: 500, clientY: 500, detail: 1 })

    expect(toggled.count).toBe(1)
  })

  it("Enter と Space で遡り、既定の動作を止める。ほかのキーは何もしない", () => {
    const { toggled, result } = renderSpeech(false)

    const enter = key("Enter")
    result.current.onKeyDown(enter)
    const space = key(" ")
    result.current.onKeyDown(space)
    const other = key("a")
    result.current.onKeyDown(other)

    expect(toggled.count).toBe(2)
    expect([enter.prevented(), space.prevented(), other.prevented()]).toEqual([true, true, false])
  })
})

describe("useChatSpeech の育っている最中", () => {
  it("育っている最中に押すと、遡らずにその場で全文を出す", () => {
    const { toggled, result } = renderSpeech(true)
    expect(result.current.growing).toBe(true)

    act(() => {
      press(result.current, 0)
    })

    expect(toggled.count).toBe(0)
    expect(result.current.growing).toBe(false)
    expect(result.current.shown).toBe("架空のセリフ")
  })

  it("育っている最中のキーも打ち切りに使い、遡らない", () => {
    const { toggled, result } = renderSpeech(true)

    act(() => {
      result.current.onKeyDown(key("Enter"))
    })

    expect(toggled.count).toBe(0)
    expect(result.current.growing).toBe(false)
  })
})
