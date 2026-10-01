import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useRevealedChatLog } from "../../../../../../../../src/browser/components/page/conversation/components/chat-view/hooks/use-speech-reveal.ts"
import {
  chatLogEntries,
  type ChatLogEntry,
} from "../../../../../../../../src/shared/chat/chat-log.ts"
import { speechRecord } from "../../../../../../../fixture/session-record.ts"

/**
 * 足止めが空く時刻に1回だけタイマーが鳴ることと、2秒の間合いを測る。
 * 時計は偽のタイマーの `performance.now()` を `Temporal.Now.instant` に写して合わせる。文面は手で書いた架空のもの
 */

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Temporal.Now, "instant").mockImplementation(() =>
    Temporal.Instant.fromEpochMilliseconds(Math.floor(performance.now())),
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function speeches(count: number): readonly ChatLogEntry[] {
  return chatLogEntries(
    Array.from({ length: count }, (_, index) =>
      speechRecord({ text: `${String(index + 1)}件目の架空のセリフ` }),
    ),
  )
}

/** 空の状態で開き、1件目を出した状態から始める。描画の回数も数える。 */
function openWithFirstSpeech(): {
  readonly result: { readonly current: ReturnType<typeof useRevealedChatLog> }
  readonly renders: () => number
  readonly rerender: (entries: readonly ChatLogEntry[]) => void
  readonly unmount: () => void
} {
  let renderCount = 0
  const { result, rerender, unmount } = renderHook(
    ({ entries }: { readonly entries: readonly ChatLogEntry[] }) => {
      renderCount += 1
      return useRevealedChatLog(entries)
    },
    { initialProps: { entries: speeches(0) } },
  )
  rerender({ entries: speeches(1) })
  return {
    result,
    renders: () => renderCount,
    rerender: (entries) => {
      rerender({ entries })
    },
    unmount,
  }
}

describe("useRevealedChatLog の足止め", () => {
  it("次のセリフは、前の吹き出しからちょうど2秒で出る", () => {
    const { result, rerender } = openWithFirstSpeech()
    expect(result.current.entries).toHaveLength(1)

    rerender(speeches(2))
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.pending).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(result.current.entries).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.pending).toBe(false)
  })

  it("足止めのあいだはタイマーが1つで、空く時刻に1回だけ描き直す", () => {
    const { renders, rerender } = openWithFirstSpeech()
    rerender(speeches(2))
    const before = renders()
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(renders()).toBe(before)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    const afterOpen = renders()
    expect(afterOpen).toBeGreaterThan(before)
    expect(vi.getTimerCount()).toBe(0)

    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(renders()).toBe(afterOpen)
  })

  it("足止めのあいだに続きが届いても、タイマーは1つのまま", () => {
    const { rerender } = openWithFirstSpeech()
    rerender(speeches(2))
    rerender(speeches(3))
    expect(vi.getTimerCount()).toBe(1)
  })

  it("出す件数が変わらないあいだは、同じ参照の配列を返す", () => {
    const { result, rerender } = openWithFirstSpeech()
    rerender(speeches(2))
    const held = result.current.entries

    // 中身が同じなら、組み直した配列が届いても同じ参照のまま。
    rerender(speeches(2))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.entries).toBe(held)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.entries).not.toBe(held)
    expect(result.current.entries).toHaveLength(2)
  })

  it("外すとタイマーが残らない", () => {
    const { rerender, unmount } = openWithFirstSpeech()
    rerender(speeches(2))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
