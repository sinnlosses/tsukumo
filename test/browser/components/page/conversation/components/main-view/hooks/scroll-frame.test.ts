import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { subscribeScrollFrame } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/scroll-frame.ts"

let pendingFrames: (() => void)[]

beforeEach(() => {
  pendingFrames = []
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => pendingFrames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", () => {
    pendingFrames = []
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function runFrame(): void {
  const frames = pendingFrames
  pendingFrames = []
  for (const frame of frames) {
    frame()
  }
}

describe("subscribeScrollFrame", () => {
  it("連続する scroll は 1 フレームに 1 回しか配らない", () => {
    const listener = vi.fn<() => void>()
    const unsubscribe = subscribeScrollFrame(listener)

    for (let count = 0; count < 10; count += 1) {
      document.dispatchEvent(new Event("scroll"))
    }
    expect(listener).not.toHaveBeenCalled()
    runFrame()
    expect(listener).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new Event("scroll"))
    runFrame()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it("購読者がいくつでも document に付ける scroll の購読は 1 つで、全員が外すと外す", () => {
    const add = vi.spyOn(document, "addEventListener")
    const remove = vi.spyOn(document, "removeEventListener")
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()
    const unsubscribeFirst = subscribeScrollFrame(first)
    const unsubscribeSecond = subscribeScrollFrame(second)

    expect(add.mock.calls.filter(([type]) => type === "scroll")).toHaveLength(1)
    document.dispatchEvent(new Event("scroll"))
    runFrame()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    unsubscribeFirst()
    expect(remove).not.toHaveBeenCalled()
    unsubscribeSecond()
    expect(remove.mock.calls.filter(([type]) => type === "scroll")).toHaveLength(1)
  })
})
