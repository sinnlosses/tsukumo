import { renderHook } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useEventListener } from "../../../src/browser/hooks/use-event-listener.ts"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useEventListener", () => {
  it("張ったリスナで受け、外れると解く", () => {
    const target = new EventTarget()
    const handler = vi.fn<() => void>()
    const view = renderHook(() => {
      useEventListener(target, "ping", handler)
    })
    target.dispatchEvent(new Event("ping"))
    expect(handler).toHaveBeenCalledTimes(1)
    view.unmount()
    target.dispatchEvent(new Event("ping"))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("handler が変わっても張り直さず、最新の handler が呼ばれる", () => {
    const target = new EventTarget()
    const add = vi.spyOn(target, "addEventListener")
    const remove = vi.spyOn(target, "removeEventListener")
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()
    const view = renderHook(
      ({ handler }) => {
        useEventListener(target, "ping", handler)
      },
      { initialProps: { handler: first } },
    )
    view.rerender({ handler: second })
    target.dispatchEvent(new Event("ping"))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
  })

  it("enabled が偽のあいだは張らず、真になると張り、偽に戻すと外す", () => {
    const target = new EventTarget()
    const handler = vi.fn<() => void>()
    const view = renderHook(
      ({ enabled }) => {
        useEventListener(target, "ping", handler, { enabled })
      },
      { initialProps: { enabled: false } },
    )
    target.dispatchEvent(new Event("ping"))
    expect(handler).not.toHaveBeenCalled()
    view.rerender({ enabled: true })
    target.dispatchEvent(new Event("ping"))
    expect(handler).toHaveBeenCalledTimes(1)
    view.rerender({ enabled: false })
    target.dispatchEvent(new Event("ping"))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("capture を渡して張り、同じ capture で解く", () => {
    const target = new EventTarget()
    const add = vi.spyOn(target, "addEventListener")
    const remove = vi.spyOn(target, "removeEventListener")
    const view = renderHook(() => {
      useEventListener(target, "ping", () => {}, { capture: true })
    })
    view.unmount()
    expect(add).toHaveBeenCalledWith("ping", expect.any(Function), { capture: true })
    expect(remove).toHaveBeenCalledWith("ping", expect.any(Function), { capture: true })
  })

  it("setup→cleanup→setup の再演で、張った数と解いた数が釣り合う", () => {
    const target = new EventTarget()
    const add = vi.spyOn(target, "addEventListener")
    const remove = vi.spyOn(target, "removeEventListener")
    const handler = vi.fn<() => void>()
    const view = renderHook(
      () => {
        useEventListener(target, "ping", handler)
      },
      { wrapper: StrictMode },
    )
    expect(add).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(1)
    target.dispatchEvent(new Event("ping"))
    expect(handler).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(remove).toHaveBeenCalledTimes(2)
  })
})
