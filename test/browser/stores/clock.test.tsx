import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useNowWhile } from "../../../src/browser/stores/clock.ts"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useNowWhile", () => {
  it("購読者が2つ居ても setInterval は1本", () => {
    const spy = vi.spyOn(globalThis, "setInterval")
    renderHook(() => useNowWhile(true))
    renderHook(() => useNowWhile(true))

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("購読者が居なくなると時計が止まる", () => {
    const first = renderHook(() => useNowWhile(true))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(vi.getTimerCount()).toBe(1)

    first.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it("active が false のあいだは時計を立てない", () => {
    renderHook(() => useNowWhile(false))

    expect(vi.getTimerCount()).toBe(0)
  })

  it("刻むたびに値が進む", () => {
    const { result } = renderHook(() => useNowWhile(true))
    const before = result.current

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current).toBeGreaterThan(before)
  })
})
