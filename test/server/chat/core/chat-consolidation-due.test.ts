import { describe, expect, it } from "vitest"

import { isConsolidationDue } from "../../../../src/server/chat/core/chat-consolidation-due.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/server/chat/core/chat-memory-budget.ts"

const EVERY = CHAT_MEMORY_BUDGET.consolidateEveryBytes

describe("isConsolidationDue", () => {
  it("契機に届かず打ち切りでもなければ届いていない", () => {
    expect(isConsolidationDue({ overflowed: false, usedBytes: EVERY - 1 })).toBe(false)
  })

  it("契機ちょうどで届く", () => {
    expect(isConsolidationDue({ overflowed: false, usedBytes: EVERY })).toBe(true)
  })

  it("打ち切ったときはバイト数が少なくても届いたものとする", () => {
    expect(isConsolidationDue({ overflowed: true, usedBytes: 0 })).toBe(true)
  })
})
