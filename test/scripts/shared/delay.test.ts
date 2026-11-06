import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { delay } from "../../../scripts/shared/delay.ts"

describe("delay", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("指定のミリ秒がたつまで解決しない", async () => {
    let done = false
    void delay(100).then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(99)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })
})
