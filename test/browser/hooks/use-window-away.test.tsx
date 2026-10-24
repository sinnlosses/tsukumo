import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useWindowAway } from "../../../src/browser/hooks/use-window-away.ts"

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(document, "hidden")
})

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
}

describe("useWindowAway", () => {
  it("初めは窓が見えていれば false", () => {
    const { result } = renderHook(() => useWindowAway())

    expect(result.current).toBe(false)
  })

  it("blur で true、focus で false に戻る", () => {
    const { result } = renderHook(() => useWindowAway())

    act(() => {
      window.dispatchEvent(new Event("blur"))
    })
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    expect(result.current).toBe(false)
  })

  it("document.hidden の間は true、戻ると false", () => {
    const { result } = renderHook(() => useWindowAway())

    act(() => {
      setHidden(true)
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(result.current).toBe(true)

    act(() => {
      setHidden(false)
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(result.current).toBe(false)
  })

  it("初めから hidden なら true", () => {
    setHidden(true)

    const { result } = renderHook(() => useWindowAway())

    expect(result.current).toBe(true)
  })
})
