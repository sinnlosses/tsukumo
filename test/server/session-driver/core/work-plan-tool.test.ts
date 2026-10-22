import { describe, expect, it } from "vitest"

import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import { answerWorkPlanCall } from "../../../../src/server/session-driver/core/work-plan-tool.ts"

const PHASES = ["架空の段A", "架空の段B", "架空の段C"]
const LONG_SUMMARY = "架空の一つ目。架空の二つ目。架空の三つ目。"

describe("answerWorkPlanCall の malformed の差し戻し", () => {
  const answer = (input: unknown): string => {
    const result = answerWorkPlanCall(createCallReview(), input)
    expect(result.isError).toBe(true)
    return result.text
  }

  it("まとめが無い・それ以外の崩れで別の固定文を返し、呼び出しの内容を入れない", () => {
    const missing = answer({ phases: PHASES, current: 1 })
    const other = answer({ phases: PHASES, current: 9, phaseSummary: LONG_SUMMARY })

    expect(new Set([missing, other]).size).toBe(2)
    for (const text of [missing, other]) {
      expect(text).not.toContain("架空")
    }
  })
})
