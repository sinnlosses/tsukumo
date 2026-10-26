import { describe, expect, it } from "vitest"

import { createWorkPlanReview } from "../../../../src/server/work-plan/core/work-plan-review.ts"
import { answerWorkPlanCall } from "../../../../src/server/work-plan/core/work-plan-tool.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { REQUEST, SUMMARY } from "../../../fixture/work-plan-review.ts"

describe("WorkPlanReview の委譲先の段の範囲の確定", () => {
  const FOUR = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
  const ranged = (current: number, phaseSummary = "", range: unknown = { first: 1, count: 2 }) => ({
    phases: FOUR,
    current,
    phaseSummary,
    delegatedRange: range,
  })
  const acceptedPlan = (review: ReturnType<typeof createWorkPlanReview>, input: unknown) => {
    const verdict = review.judge(input)
    if (verdict.kind !== "accepted") {
      throw new Error("受け付けられる引数を渡す")
    }
    return verdict.plan
  }
  const emittedRange = (
    review: ReturnType<typeof createWorkPlanReview>,
    input: unknown,
    content = "ok",
  ) => {
    const plan = acceptedPlan(review, input)
    review.pass({ kind: "work-plan-called", toolUseId: "toolu_e", plan })
    const [event] = review.pass({
      kind: "tool-finished",
      toolUseId: "toolu_e",
      content,
      isError: false,
    })
    return event
  }

  it("範囲の count が最後に受けた phase_result の count と違っても差し戻さず、phase_result の count で確定する", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.judgeResult({ phase: 1, count: 3, outcome: "finished" })

    expect(review.judge(ranged(1, SUMMARY)).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "range", first: 1, count: 3 })
  })

  it("count を省いた範囲は phase_result の count で確定し、first も省けば受け付け済みの範囲の first を引き継ぐ", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0, "", { first: 1 }))
    review.judgeResult({ phase: 1, count: 2, outcome: "finished" })

    expect(review.judge(ranged(1, SUMMARY, { first: 1 })).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "range", first: 1, count: 2 })
    expect(review.judge({ ...ranged(1, SUMMARY), delegatedRange: undefined }).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "range", first: 1, count: 2 })
  })

  it("first も count も省いた範囲は、今の位置の次を first に phase_result の count で確定する", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0, "", {}))
    expect(review.delegatedRange()).toEqual({ kind: "pending", first: 1 })
    review.judgeResult({ phase: 1, count: 2, outcome: "finished" })

    expect(review.judge(ranged(0, "", {})).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "range", first: 1, count: 2 })
  })

  it("current が 1 以上で {} を渡しても first は受け付け済みの範囲のまま動かず、count は phase_result で確定する", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0, "", {}))
    review.judgeResult({ phase: 1, count: 2, outcome: "finished" })

    expect(review.judge(ranged(1, SUMMARY, {})).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "range", first: 1, count: 2 })
    expect(review.judge(ranged(2, SUMMARY, {})).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "range", first: 1, count: 2 })
  })

  it("count の来ない環境では、{} を渡し続けても first は動かず pending のまま通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)

    expect(review.judge(ranged(0, "", {})).kind).toBe("accepted")
    expect(review.judge(ranged(1, SUMMARY, {})).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "pending", first: 1 })
  })

  it("確定した範囲が並びをはみ出すなら malformed", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.judgeResult({ phase: 1, count: 9, outcome: "finished" })

    expect(review.judge(ranged(1, SUMMARY)).kind).toBe("malformed")
  })

  it("work-plan のイベントには、省いた範囲も食い違った count も確定した範囲が載る", () => {
    const omitted = createWorkPlanReview()
    omitted.pass(REQUEST)
    omitted.judge(ranged(0, "", { first: 1 }))
    omitted.judgeResult({ phase: 1, count: 2, outcome: "finished" })
    expect(emittedRange(omitted, ranged(1, SUMMARY, {}))).toMatchObject({
      delegatedRange: { kind: "range", first: 1, count: 2 },
    })

    const mismatched = createWorkPlanReview()
    mismatched.pass(REQUEST)
    mismatched.judge(ranged(0))
    mismatched.judgeResult({ phase: 1, count: 2, outcome: "finished" })
    expect(emittedRange(mismatched, ranged(1, SUMMARY, { first: 1, count: 1 }))).toMatchObject({
      delegatedRange: { kind: "range", first: 1, count: 2 },
    })
  })

  it("組み直しでは、count を省いた範囲を work_plan の答えの範囲の行から確定する", () => {
    const live = createWorkPlanReview()
    live.pass(REQUEST)
    live.judge(ranged(0, "", {}))
    live.judgeResult({ phase: 1, count: 2, outcome: "finished" })
    const answered = answerWorkPlanCall({ judgeWorkPlan: live.judge }, ranged(1, SUMMARY, {}))

    const restored = createWorkPlanReview()
    const recorded: readonly SessionEvent[] = [
      REQUEST,
      {
        kind: "work-plan-called",
        toolUseId: "toolu_r",
        plan: {
          phases: FOUR,
          current: 1,
          finishedInGroup: [],
          phaseSummary: SUMMARY,
          delegatedRange: { kind: "pending", first: 2 },
          skippedPhases: [],
          awaitingSummary: { kind: "none" },
        },
      },
      { kind: "tool-finished", toolUseId: "toolu_r", content: answered.text, isError: false },
    ]
    const out = recorded.flatMap((event) => restored.pass(event))

    expect(out[1]).toMatchObject({ delegatedRange: { kind: "range", first: 1, count: 2 } })
  })

  it("範囲の行の無い過去の work_plan の記録は、呼び出しに書かれた範囲のまま読み戻せる", () => {
    const review = createWorkPlanReview()
    const recorded: readonly SessionEvent[] = [
      REQUEST,
      {
        kind: "work-plan-called",
        toolUseId: "toolu_o",
        plan: {
          phases: FOUR,
          current: 1,
          finishedInGroup: [],
          phaseSummary: SUMMARY,
          delegatedRange: { kind: "range", first: 1, count: 2 },
          skippedPhases: [],
          awaitingSummary: { kind: "none" },
        },
      },
      { kind: "tool-finished", toolUseId: "toolu_o", content: "ok", isError: false },
    ]
    const out = recorded.flatMap((event) => review.pass(event))

    expect(out.map((event) => event.kind)).toEqual(["request", "work-plan", "tool-finished"])
    expect(out[1]).toMatchObject({ delegatedRange: { kind: "range", first: 1, count: 2 } })
  })
})
