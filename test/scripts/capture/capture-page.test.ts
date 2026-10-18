import { afterEach, describe, expect, test, vi } from "vitest"

import {
  collectMisses,
  settleRender,
  waitForRevealEnd,
  waitUntilStable,
} from "../../../scripts/capture/lib/capture-page.ts"
import type { Preparation } from "../../../scripts/capture/lib/capture-preparation.ts"

const click = (selector: string): Preparation => ({ kind: "click", selector })

/** `missing` のセレクタの手だけ当たらない。試した順を `tried` に残す。 */
function applier(missing: readonly string[]): {
  apply: (step: Preparation) => Promise<boolean>
  tried: string[]
} {
  const tried: string[] = []
  return {
    tried,
    apply: (step) => {
      if (step.kind === "click") {
        tried.push(step.selector)
        return Promise.resolve(!missing.includes(step.selector))
      }
      return Promise.resolve(true)
    },
  }
}

describe("collectMisses", () => {
  test("全部当たれば空", async () => {
    const { apply } = applier([])
    expect(await collectMisses([click("a"), click("b")], apply, "continue")).toEqual([])
  })

  test("continue は外れを控えて残りも試す", async () => {
    const { apply, tried } = applier(["b"])
    const missed = await collectMisses([click("a"), click("b"), click("c")], apply, "continue")
    expect(missed).toEqual([click("b")])
    expect(tried).toEqual(["a", "b", "c"])
  })

  test("stop は最初の外れで打ち切る", async () => {
    const { apply, tried } = applier(["b"])
    const missed = await collectMisses([click("a"), click("b"), click("c")], apply, "stop")
    expect(missed).toEqual([click("b")])
    expect(tried).toEqual(["a", "b"])
  })

  test("手が無ければ空", async () => {
    const { apply } = applier([])
    expect(await collectMisses([], apply, "stop")).toEqual([])
  })
})

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

describe("settleRender", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("ページの中の待ちが終われば返る", async () => {
    const evaluate = vi.fn(() => Promise.resolve())

    await expect(settleRender({ evaluate })).resolves.toBeUndefined()
    expect(evaluate).toHaveBeenCalledTimes(1)
  })

  describe("ページの中の待ち", () => {
    class FakeDocumentTimeline {
      readonly kind = "document"
    }
    class FakeScrollTimeline {
      readonly kind = "scroll"
    }

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    /** `settleRender` が渡す関数を、スタブのページ環境でそのまま実行する。 */
    async function runInPage(
      animations: readonly { timeline: object; endTime: number; finished: Promise<unknown> }[],
    ): Promise<void> {
      vi.stubGlobal("DocumentTimeline", FakeDocumentTimeline)
      vi.stubGlobal("document", {
        fonts: { ready: Promise.resolve() },
        images: [],
        getAnimations: () =>
          animations.map((animation) => ({
            timeline: animation.timeline,
            effect: { getComputedTiming: () => ({ endTime: animation.endTime }) },
            finished: animation.finished,
          })),
      })
      vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
        callback()
      })
      await settleRender({ evaluate: (fn: () => Promise<void>) => fn() })
    }

    test("時計の有限の動きは終わるまで待つ", async () => {
      let finish = (): void => undefined
      const finished = new Promise<void>((resolve) => {
        finish = resolve
      })
      let returned = false
      const run = runInPage([
        { timeline: new FakeDocumentTimeline(), endTime: 300, finished },
      ]).then(() => {
        returned = true
      })

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
      expect(returned).toBe(false)
      finish()
      await run
      expect(returned).toBe(true)
    })

    test("時計の終わりのない動きは待たない", async () => {
      await expect(
        runInPage([
          {
            timeline: new FakeDocumentTimeline(),
            endTime: Infinity,
            finished: new Promise(() => undefined),
          },
        ]),
      ).resolves.toBeUndefined()
    })

    test("スクロール連動の動きは終わらなくても待たない", async () => {
      await expect(
        runInPage([
          {
            timeline: new FakeScrollTimeline(),
            endTime: 100,
            finished: new Promise(() => undefined),
          },
        ]),
      ).resolves.toBeUndefined()
    })
  })

  test("ページの中の待ちが終わらなければ、上限で撮らずに落とす", async () => {
    vi.useFakeTimers()
    const outcome = settleRender({ evaluate: () => new Promise(() => undefined) }).then(
      () => "返った",
      (error: unknown) => error,
    )

    await vi.advanceTimersByTimeAsync(5000)

    expect(await outcome).toEqual(new Error("描き直しが終わらなかった（5000ms）"))
  })
})

describe("waitForRevealEnd", () => {
  test("演出の印が消えるのを待つ", async () => {
    const waitForSelector = vi.fn(() => Promise.resolve(null))

    await waitForRevealEnd({ waitForSelector }, 1234)

    expect(waitForSelector).toHaveBeenCalledWith("[data-revealing]", {
      state: "detached",
      timeout: 1234,
    })
  })

  test("上限までに消えなくても throw しない", async () => {
    const waitForSelector = vi.fn(() => Promise.reject(new Error("timeout")))

    await expect(waitForRevealEnd({ waitForSelector }, 10)).resolves.toBeUndefined()
  })
})
