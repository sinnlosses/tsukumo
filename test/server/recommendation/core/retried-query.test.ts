import { describe, expect, it, vi } from "vitest"

import {
  runRetriedQuery,
  type CheckedAnswer,
} from "../../../../src/server/recommendation/core/retried-query.ts"

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
      const check = (answer: unknown): CheckedAnswer<string> => {
        if (answer === "first") {
          throw checkFailure
        }
        return { kind: "rejected", reason: "empty" }
      }

      const outcome = runRetriedQuery(
        ports,
        { model: "架空", systemPrompt: "架空", prompt: "架空", schema: {} },
        check,
        new AbortController().signal,
        60_000,
        5000,
      )
      const settled = expect(outcome).rejects.toBe(checkFailure)
      await vi.advanceTimersByTimeAsync(5000)
      expect(settles).toHaveLength(2)
      settles[0]?.("first")
      settles[1]?.("second")

      await settled
    } finally {
      vi.useRealTimers()
    }
  })
})
