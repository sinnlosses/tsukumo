import { describe, expect, it } from "vitest"

import {
  createCallReview,
  passRelayedEvents,
} from "../../../../src/server/session-driver/core/call-review.ts"
import {
  PHASE_RESULT_MISSING_HANDBACK_LINE,
  RESULT_CALLED_HANDBACK_LINE,
} from "../../../../src/server/work-plan/core/band-position.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"
import { checkedToolUseId } from "../../../fixture/tool-use-id.ts"

const REQUEST = requestEvent()

describe("passRelayedEvents", () => {
  const DELEGATE = checkedToolUseId("toolu_delegate")
  const RETURNED: SessionEvent = { kind: "delegate-handed-back", delegate: DELEGATE }

  it("委譲先のメッセージからは返却だけを差し戻しに通し、委譲ゲートの印と注記がそれで立つ", () => {
    const review = createCallReview()
    review.pass(REQUEST)
    review.judgeWorkPlan({
      phases: ["架空の計画", "架空の実装A", "架空の受け入れ"],
      current: 1,
      phaseSummary: "架空のまとめ。",
      delegatedRange: { first: 1, count: 1 },
    })
    const report = reportEvent({})

    expect(passRelayedEvents(review, [report, RETURNED], false)).toEqual([report])
    expect(review.gateRaised()).toBe(true)
    expect(review.takeHandbackNote()).toContain(PHASE_RESULT_MISSING_HANDBACK_LINE)
  })

  it("委譲先の phase-result-called も差し戻しに通して捨て、同じ委譲先の次の返却には phase_result が伴ったと注記する", () => {
    const review = createCallReview()
    review.pass(REQUEST)
    review.judgeWorkPlan({
      phases: ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"],
      current: 1,
      phaseSummary: "架空のまとめ。",
      delegatedRange: { first: 1, count: 2 },
    })
    const called: SessionEvent = { kind: "phase-result-called", delegate: DELEGATE }

    expect(passRelayedEvents(review, [called, RETURNED], false)).toEqual([])
    expect(review.gateRaised()).toBe(true)
    expect(review.bandPosition()).toContain("本 1/2")
    expect(review.takeHandbackNote()).toContain(RESULT_CALLED_HANDBACK_LINE)
  })

  it("メインのメッセージのイベントはすべて差し戻しに通す（report は結果まで預かる）", () => {
    const review = createCallReview()

    expect(passRelayedEvents(review, [reportEvent({})], true)).toEqual([])
  })
})
