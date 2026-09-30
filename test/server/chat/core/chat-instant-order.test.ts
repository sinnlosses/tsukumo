import { describe, expect, it } from "vitest"

import { isAfterAt, isBeforeAt } from "../../../../src/server/chat/core/chat-instant-order.ts"

describe("isAfterAt / isBeforeAt", () => {
  it("オフセットが違っても同じ時刻は前でも後でもなく、ずれていれば正しく比べる", () => {
    const utc = "2026-09-26T00:00:00Z"
    const sameInJst = "2026-09-26T09:00:00+09:00"
    const laterInJst = "2026-09-26T09:00:01+09:00"

    expect(isAfterAt(sameInJst, utc)).toBe(false)
    expect(isBeforeAt(sameInJst, utc)).toBe(false)
    expect(isAfterAt(laterInJst, utc)).toBe(true)
    expect(isBeforeAt(utc, laterInJst)).toBe(true)
  })
})
