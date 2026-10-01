import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useSpeechPress } from "../../../../../../../src/browser/components/page/conversation/components/hooks/use-speech-press.ts"

/**
 * セリフの行（雑談の `ChatSpeech`・仕事モードの `Balloon` と `speech-log` の行）を
 * 描かずに、押し方の読み替え——ドラッグとの見分け・遡るキー——だけを測る
 * （docs/architecture.md「機能の中を分ける」）。
 */

afterEach(() => {
  cleanup()
})

type Toggled = { count: number }

function renderSpeech(): {
  readonly toggled: Toggled
  readonly result: { readonly current: ReturnType<typeof useSpeechPress> }
} {
  const toggled: Toggled = { count: 0 }
  const { result } = renderHook(() =>
    useSpeechPress(() => {
      toggled.count += 1
    }),
  )
  return { toggled, result }
}

/** 押し始めから手を離すまで。`moveX` だけ横に動かすとドラッグで文字を選んだことになる。 */
function press(view: ReturnType<typeof useSpeechPress>, moveX: number, detail = 1): void {
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

describe("useSpeechPress の押し方", () => {
  it("数pxのぶれなら遡り、それを超えて動いたらドラッグとして遡らない", () => {
    const { toggled, result } = renderSpeech()

    press(result.current, 4)
    expect(toggled.count).toBe(1)

    press(result.current, 5)
    expect(toggled.count).toBe(1)
  })

  it("マウスから来ていない click（detail 0）は動いた距離に関わらず遡る", () => {
    const { toggled, result } = renderSpeech()

    press(result.current, 100, 0)

    expect(toggled.count).toBe(1)
  })

  it("押し始めが無い click は押したものとして遡る", () => {
    const { toggled, result } = renderSpeech()

    result.current.onClick({ clientX: 500, clientY: 500, detail: 1 })

    expect(toggled.count).toBe(1)
  })

  it("Enter と Space で遡り、既定の動作を止める。ほかのキーは何もしない", () => {
    const { toggled, result } = renderSpeech()

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
