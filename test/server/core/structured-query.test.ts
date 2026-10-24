import { describe, expect, it, vi } from "vitest"

import {
  runRetriedQuery,
  runWithDeadline,
  type CheckedAnswer,
} from "../../../src/server/core/structured-query.ts"

describe("runWithDeadline", () => {
  it("締め切りが来たら、走りの終わりを待たずに aborted で返り、走りには中断が届く", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      const seen: AbortSignal[] = []
      const outcome = runWithDeadline(
        new AbortController().signal,
        1000,
        (bounded) => {
          seen.push(bounded)
          return new Promise<string>(() => {})
        },
        "aborted",
      )
      await vi.advanceTimersByTimeAsync(1000)

      expect(await outcome).toBe("aborted")
      expect(seen.map((bounded) => bounded.aborted)).toEqual([true])
    } finally {
      vi.useRealTimers()
    }
  })

  it("締め切りの前に終われば、その値を返す", async () => {
    expect(
      await runWithDeadline(
        new AbortController().signal,
        60_000,
        () => Promise.resolve("written"),
        "aborted",
      ),
    ).toBe("written")
  })
})

describe("runRetriedQuery", () => {
  it("並べた1回目の答えの検査が投げても、待ちが止まらず問い合わせが終わる", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      const settles: ((value: unknown) => void)[] = []
      const ports = {
        query: () =>
          new Promise<unknown>((resolve) => {
            settles.push(resolve)
          }),
        now: () => 0,
      }
      const checkFailure = new Error("検査が投げた")
      const check = (answer: unknown): CheckedAnswer<string, string> => {
        if (answer === "first") {
          throw checkFailure
        }
        return { kind: "rejected", reason: "empty" }
      }

      const outcome = runRetriedQuery(
        ports,
        {
          kind: "recommendation",
          model: "架空",
          systemPrompt: "架空",
          prompt: "架空",
          images: [],
          schema: {},
        },
        check,
        new AbortController().signal,
        60_000,
        5000,
      )
      const settled = outcome.catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(5000)
      expect(settles).toHaveLength(2)
      settles[0]?.("first")
      settles[1]?.("second")

      expect(await settled).toBe(checkFailure)
    } finally {
      vi.useRealTimers()
    }
  })
})
