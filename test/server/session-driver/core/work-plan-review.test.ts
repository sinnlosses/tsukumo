import { describe, expect, it } from "vitest"

import { createWorkPlanReview } from "../../../../src/server/session-driver/core/work-plan-review.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

const PHASES = ["架空の段A", "架空の段B", "架空の段C"]
const SUMMARY = "架空のまとめ。"

const planOf = (current: number): Extract<SessionEvent, { kind: "work-plan" }> => ({
  kind: "work-plan",
  phases: PHASES,
  current,
  phaseSummary: current > 0 && current < PHASES.length ? SUMMARY : "",
})

const called = (toolUseId: string, current: number): SessionEvent => ({
  kind: "work-plan-called",
  toolUseId,
  plan: planOf(current),
})

const finished = (toolUseId: string, isError: boolean): SessionEvent => ({
  kind: "tool-finished",
  toolUseId,
  content: isError ? "架空の差し戻し" : "ok",
  isError,
})

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const DELEGATE_SIGNAL: SessionEvent = {
  kind: "delegate-signal",
  step: 1,
  stepCount: 1,
  summary: "架空の合図",
}

describe("WorkPlanReview の判定", () => {
  it("同じ段の並びのまま位置を2つ以上進めると差し戻し、1つずつなら通す", () => {
    const review = createWorkPlanReview()

    expect(review.judge(planOf(0)).kind).toBe("accepted")
    expect(review.judge(planOf(2)).kind).toBe("skipped-phase")
    expect(review.judge(planOf(1)).kind).toBe("accepted")
    expect(review.judge(planOf(2)).kind).toBe("accepted")
    expect(review.judge(planOf(3)).kind).toBe("accepted")
  })

  it("段の並びを組み替えた呼び出しは、位置がどこでも通す", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(0))

    expect(
      review.judge({ phases: ["架空の段X", "架空の段Y"], current: 2, phaseSummary: "" }).kind,
    ).toBe("accepted")
  })

  it("依頼と委譲の合図のあとは、前の位置を忘れる", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(0))
    review.pass(DELEGATE_SIGNAL)
    expect(review.judge(planOf(3)).kind).toBe("accepted")

    review.pass(REQUEST)
    review.judge(planOf(0))
    expect(review.judge(planOf(2)).kind).toBe("skipped-phase")
    review.pass(REQUEST)
    expect(review.judge(planOf(2)).kind).toBe("accepted")
  })
})

describe("WorkPlanReview の流れ", () => {
  it("呼び出しは結果まで預かり、差し戻されたものは捨て、通ったものだけを結果の直前に出す", () => {
    const review = createWorkPlanReview()

    expect(review.pass(called("toolu_a", 2))).toEqual([])
    expect(review.pass(finished("toolu_a", true))).toEqual([finished("toolu_a", true)])
    expect(review.pass(called("toolu_b", 1))).toEqual([])
    expect(review.pass(finished("toolu_b", false))).toEqual([planOf(1), finished("toolu_b", false)])
  })

  it("結果の届かないままターンが終わった呼び出しは、終わりの直前に出す", () => {
    const review = createWorkPlanReview()
    const turnFinished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

    review.pass(called("toolu_a", 0))

    expect(review.pass(turnFinished)).toEqual([planOf(0), turnFinished])
  })
})
