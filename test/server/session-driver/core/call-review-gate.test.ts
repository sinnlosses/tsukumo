import { describe, expect, it } from "vitest"

import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

const REQUEST = requestEvent()

describe("CallReview の委譲ゲートの印", () => {
  const FOUR = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
  const SUMMARY = "架空のまとめ。"
  const ranged = (current: number, phaseSummary = "") => ({
    phases: FOUR,
    current,
    phaseSummary,
    delegatedRange: { first: 1, count: 2 },
  })
  const handback = (): SessionEvent => ({
    kind: "delegate-handed-back",
    delegate: "toolu_delegate",
  })
  const started = (): CallReview => {
    const review = createCallReview()
    review.pass(REQUEST)
    review.judgeWorkPlan(ranged(0))
    review.judgeWorkPlan(ranged(1, SUMMARY))
    return review
  }

  it("ワークプランを受け付けた依頼で返却が届くと立つ", () => {
    const review = started()
    review.pass(handback())
    expect(review.gateRaised()).toBe(true)
  })

  it("返却は帯の位置を動かさない", () => {
    const review = started()
    expect(review.bandPosition()).toContain("帯の今の段は 本 1/2 架空の実装A。")

    review.pass(handback())

    expect(review.bandPosition()).toContain("帯の今の段は 本 1/2 架空の実装A。")
  })

  it("ワークプランが無ければ帯の位置は空", () => {
    const review = createCallReview()
    review.pass(REQUEST)

    expect(review.bandPosition()).toBe("")
  })

  it("ワークプランを受け付けていない依頼の返却では立たない", () => {
    const review = createCallReview()
    review.pass(REQUEST)

    review.pass(handback())

    expect(review.gateRaised()).toBe(false)
  })

  it("受け付けた work_plan で下り、差し戻された work_plan では下りない", () => {
    const review = started()
    review.pass(handback())

    expect(review.judgeWorkPlan(ranged(3)).kind).toBe("summary-missing")
    expect(review.gateRaised()).toBe(true)
    expect(review.judgeWorkPlan(ranged(2, SUMMARY)).kind).toBe("accepted")
    expect(review.gateRaised()).toBe(false)
  })

  it("続けて届いた返却も、1回の work_plan で下りる", () => {
    const review = started()
    review.pass(handback())
    review.pass(handback())

    expect(review.judgeWorkPlan(ranged(2, SUMMARY)).kind).toBe("accepted")
    expect(review.gateRaised()).toBe(false)
  })

  it("次の依頼で下りる", () => {
    const review = started()
    review.pass(handback())

    review.pass(REQUEST)

    expect(review.gateRaised()).toBe(false)
  })
})
