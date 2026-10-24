import { afterEach, describe, expect, test, vi } from "vitest"

import { waitUntilStable } from "../../../../scripts/capture/lib/stable-sample.ts"

describe("waitUntilStable", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function sampler(frames: readonly string[]): {
    sample: () => Promise<Buffer>
    calls: () => number
  } {
    let calls = 0
    return {
      sample: () => {
        const frame = frames[Math.min(calls, frames.length - 1)] ?? ""
        calls += 1
        return Promise.resolve(Buffer.from(frame))
      },
      calls: () => calls,
    }
  }

  test("連続2回が一致したところで true を返し、それ以上撮らない", async () => {
    vi.useFakeTimers()
    const { sample, calls } = sampler(["a", "b", "c", "c", "d"])
    const outcome = waitUntilStable(sample, { intervalMs: 100, attempts: 10 })

    await vi.advanceTimersByTimeAsync(1000)

    expect(await outcome).toBe(true)
    expect(calls()).toBe(4)
  })

  test("離れた2回が同じでも、連続していなければ静止とみなさない", async () => {
    vi.useFakeTimers()
    const { sample } = sampler(["a", "b", "a", "b", "a", "b"])
    const outcome = waitUntilStable(sample, { intervalMs: 100, attempts: 6 })

    await vi.advanceTimersByTimeAsync(1000)

    expect(await outcome).toBe(false)
  })

  test("一致しないまま回数が尽きたら false を返し、回数を超えて撮らない", async () => {
    vi.useFakeTimers()
    const { sample, calls } = sampler(["a", "b", "c", "d", "e", "f", "g", "h"])
    const outcome = waitUntilStable(sample, { intervalMs: 100, attempts: 5 })

    await vi.advanceTimersByTimeAsync(1000)

    expect(await outcome).toBe(false)
    expect(calls()).toBe(5)
  })
})
