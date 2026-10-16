import { describe, expect, it } from "vitest"

import {
  judgePhaseMention,
  PHASE_MENTION_REJECTION_TEXT,
} from "../../../../src/server/session-driver/core/phase-mention.ts"
import type { DelegatedRange } from "../../../../src/shared/session/work-plan.ts"

const RANGE = { kind: "range", first: 1, count: 3 } as const satisfies DelegatedRange
const REJECTED = { kind: "rejected", text: PHASE_MENTION_REJECTION_TEXT } as const
const ACCEPTED = { kind: "accepted" } as const

describe("judgePhaseMention", () => {
  it("範囲が無ければ、どの番号でも検査しない", () => {
    expect(judgePhaseMention({ kind: "none" }, 9)).toEqual(ACCEPTED)
  })

  it("pending でも、どの番号でも検査しない", () => {
    expect(judgePhaseMention({ kind: "pending", first: 1 }, 9)).toEqual(ACCEPTED)
  })

  it.each([1, 2, 3])("範囲の中の番号 %d は通す", (phase) => {
    expect(judgePhaseMention(RANGE, phase)).toEqual(ACCEPTED)
  })

  it.each([0, -1, 4])("範囲の外の番号 %d は差し戻す", (phase) => {
    expect(judgePhaseMention(RANGE, phase)).toEqual(REJECTED)
  })
})
