import { afterEach, describe, expect, test, vi } from "vitest"

import { settleRender } from "../../../../scripts/capture/lib/render-settle.ts"

describe("settleRender", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("ページの中の待ちが終われば返る", async () => {
    const evaluate = vi.fn<() => Promise<void>>(() => Promise.resolve())

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
