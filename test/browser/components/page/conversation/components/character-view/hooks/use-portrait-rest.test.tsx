import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePortraitRest } from "../../../../../../../../src/browser/components/page/conversation/components/character-view/hooks/use-portrait-rest.ts"

/** 要件の「無操作60秒」。実装の定数は読まず、値そのものを固定する。 */
const PORTRAIT_REST_MS = 60_000

const ACTIVITY = {}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe("usePortraitRest", () => {
  it("何も起きないまま PORTRAIT_REST_MS 経つと true になる", () => {
    const { result } = renderHook(() => usePortraitRest(ACTIVITY))

    advance(PORTRAIT_REST_MS - 1)
    expect(result.current).toBe(false)

    advance(1)
    expect(result.current).toBe(true)
  })

  it("操作で false に戻り、そこからまた数え直す", () => {
    const { result } = renderHook(() => usePortraitRest(ACTIVITY))
    advance(PORTRAIT_REST_MS)
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })
    expect(result.current).toBe(false)

    advance(PORTRAIT_REST_MS - 1)
    expect(result.current).toBe(false)
    advance(1)
    expect(result.current).toBe(true)
  })

  it("activity の参照が替わると数え直す", () => {
    const { result, rerender } = renderHook(({ activity }) => usePortraitRest(activity), {
      initialProps: { activity: {} },
    })
    advance(PORTRAIT_REST_MS - 1)

    rerender({ activity: {} })
    advance(PORTRAIT_REST_MS - 1)
    expect(result.current).toBe(false)

    advance(1)
    expect(result.current).toBe(true)
  })

  it("アンマウントでタイマーと購読が残らない", () => {
    const { unmount } = renderHook(() => usePortraitRest(ACTIVITY))

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
