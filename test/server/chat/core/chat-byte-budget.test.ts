import { describe, expect, it } from "vitest"

import { takeWithinBytes } from "../../../../src/server/chat/core/chat-byte-budget.ts"

const sizeOf = (n: number): number => n

describe("takeWithinBytes", () => {
  it("ちょうど上限までは載り、列を使い切れば溢れた印は立たない", () => {
    const result = takeWithinBytes([3, 2], { limitBytes: 5, sizeOf, whenFirstExceeds: "stop" })

    expect(result).toEqual({ taken: [3, 2], usedBytes: 5, overflowed: false })
  })

  it("溢れる1件は載せず、そこで止まって印が立つ", () => {
    const result = takeWithinBytes([3, 3, 1], { limitBytes: 5, sizeOf, whenFirstExceeds: "stop" })

    expect(result).toEqual({ taken: [3], usedBytes: 3, overflowed: true })
  })

  it("先頭の1件だけで超えるとき、stop は空・take はその1件だけを載せる", () => {
    const stopped = takeWithinBytes([9, 1], { limitBytes: 5, sizeOf, whenFirstExceeds: "stop" })
    const taken = takeWithinBytes([9, 1], { limitBytes: 5, sizeOf, whenFirstExceeds: "take" })

    expect(stopped).toEqual({ taken: [], usedBytes: 0, overflowed: true })
    expect(taken).toEqual({ taken: [9], usedBytes: 9, overflowed: true })
  })

  it("溢れたあとの要素は列から引かない", () => {
    let pulled = 0
    function* items(): Generator<number> {
      for (const n of [3, 3, 1, 1]) {
        pulled += 1
        yield n
      }
    }

    takeWithinBytes(items(), { limitBytes: 5, sizeOf, whenFirstExceeds: "stop" })

    expect(pulled).toBe(2)
  })
})
