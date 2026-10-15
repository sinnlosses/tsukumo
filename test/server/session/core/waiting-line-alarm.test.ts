import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createWaitingLineAlarm } from "../../../../src/server/session/core/waiting-line-alarm.ts"

describe("createWaitingLineAlarm", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * 手で進める時計で作った目覚まし。`advance` は時計を進めてから偽のタイマーを同じだけ進める。
   * `lagMs` は時計をタイマーより遅らせる量（タイマーが時計より早く発火する場合を作る）。
   */
  function alarm(): {
    readonly rings: () => number
    readonly set: (dueAt: number | undefined) => void
    readonly advance: (ms: number) => void
    readonly lag: (ms: number) => void
  } {
    let clock = 0
    let lagMs = 0
    let count = 0
    const created = createWaitingLineAlarm({
      now: () => clock - lagMs,
      ring: () => {
        count += 1
      },
    })
    return {
      rings: () => count,
      set: created.set,
      advance: (ms) => {
        clock += ms
        vi.advanceTimersByTime(ms)
      },
      lag: (ms) => {
        lagMs = ms
      },
    }
  }

  it("出す時刻に1回だけ鳴り、同じ時刻を渡し直しても鳴らし直さない", () => {
    const { rings, set, advance } = alarm()

    set(1000)
    advance(999)
    expect(rings()).toBe(0)
    advance(1)
    expect(rings()).toBe(1)

    set(1000)
    advance(5000)
    expect(rings()).toBe(1)
  })

  it("時刻が変われば立て直し、undefined なら止める", () => {
    const { rings, set, advance } = alarm()

    set(1000)
    set(3000)
    advance(2000)
    expect(rings()).toBe(0)
    advance(1000)
    expect(rings()).toBe(1)

    set(5000)
    set(undefined)
    advance(10_000)
    expect(rings()).toBe(1)
  })

  it("タイマーが時計より早く発火したら、時計が出す時刻に届くまで鳴らさない", () => {
    const { rings, set, advance, lag } = alarm()

    set(1000)
    lag(1)
    advance(1000)
    expect(rings()).toBe(0)
    advance(1)
    expect(rings()).toBe(1)
  })
})
