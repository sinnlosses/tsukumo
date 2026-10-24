import { describe, expect, it } from "vitest"

import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import {
  answerPhaseResultCall,
  judgePhaseResultCaller,
} from "../../../../src/server/session-driver/core/phase-result-tool.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

const PHASES = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]

function plannedReview() {
  const review = createCallReview()
  review.pass(requestEvent())
  review.judgeWorkPlan({
    phases: PHASES,
    current: 1,
    phaseSummary: "架空のまとめ。",
    delegatedRange: { first: 1, count: 2 },
  })
  return review
}

describe("answerPhaseResultCall", () => {
  it("帯を動かしたときだけ、結果を読んだ返却を流す", () => {
    const review = plannedReview()
    const events: SessionEvent[] = []

    const moved = answerPhaseResultCall(
      review,
      { phase: 1, count: 2, outcome: "finished" },
      (event) => events.push(event),
    )
    const unmoved = answerPhaseResultCall(
      review,
      { phase: 1, count: 2, outcome: "finished" },
      (event) => events.push(event),
    )

    expect(moved.text.startsWith("ok\n帯の今の段は 本 2/2")).toBe(true)
    expect(unmoved.text.startsWith("ok\n帯は動いていない。帯の今の段は 本 2/2")).toBe(true)
    expect(events).toEqual([
      {
        kind: "delegate-returned",
        handback: { kind: "phase-done", phase: 1, count: 2, summary: "" },
      },
    ])
  })

  it("形の誤りは差し戻しの文を返し、何も流さない", () => {
    const events: SessionEvent[] = []

    expect(
      answerPhaseResultCall(plannedReview(), { phase: 0, count: 2, outcome: "finished" }, (event) =>
        events.push(event),
      ),
    ).toEqual({
      text: expect.stringContaining("phase は 1 から count までの整数にし"),
      isError: true,
    })
    expect(events).toEqual([])
  })
})

describe("judgePhaseResultCaller", () => {
  it("メインの phase_result だけを拒み、委譲先の呼び出しとほかのツールは通す", () => {
    expect(judgePhaseResultCaller("mcp__tsukumo__phase_result", false)).toEqual({
      kind: "deny",
      reason: expect.stringContaining(
        "phase_result は委譲先が段の結果を返すツールで、メインは呼ばない",
      ),
    })
    expect(judgePhaseResultCaller("mcp__tsukumo__phase_result", true)).toEqual({ kind: "allow" })
    expect(judgePhaseResultCaller("mcp__tsukumo__work_plan", false)).toEqual({ kind: "allow" })
  })
})
