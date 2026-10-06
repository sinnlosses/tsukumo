import { describe, expect, it } from "vitest"

import { createWorkPlanReview } from "../../../../src/server/session-driver/core/work-plan-review.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import type { WorkPlanClosing } from "../../../../src/shared/session/work-plan.ts"
import { reportEvent } from "../../../fixture/report-event.ts"

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
const returnedAt = (finishedPhase: number): SessionEvent => ({
  kind: "delegate-returned",
  finishedPhase,
  phaseCount: 1,
  summary: "架空の返却。",
})
const RETURNED = returnedAt(0)

const reportOf = (workPlanClosing: WorkPlanClosing): SessionEvent =>
  reportEvent({ workPlanClosing })

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

  it("依頼のあとは、前の位置を忘れる", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(0))
    expect(review.judge(planOf(2)).kind).toBe("skipped-phase")
    review.pass(REQUEST)
    expect(review.judge(planOf(2)).kind).toBe("accepted")
  })

  it("形の崩れた引数は malformed で差し戻す", () => {
    const review = createWorkPlanReview()

    expect(review.judge({ phases: PHASES, current: 9 }).kind).toBe("malformed")
    expect(review.judge({ phases: PHASES, current: 1 }).kind).toBe("malformed")
  })

  it("委譲の返却で進んだ位置から、メインの呼び出しは +1 だけ通り、+2 は差し戻す", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(0))
    review.pass(RETURNED)

    expect(review.judge(planOf(3)).kind).toBe("skipped-phase")
    expect(review.judge(planOf(1)).kind).toBe("accepted")
    review.pass(returnedAt(1))
    expect(review.judge(planOf(3)).kind).toBe("accepted")
  })

  it("委譲の返却は、最後の段より先へ覚えた位置を進めない", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(1))
    review.pass(returnedAt(1))
    review.pass(returnedAt(2))

    expect(review.standing()).toEqual({ kind: "planned", remaining: 1 })
  })

  it("段取りの無い依頼の返却は何も覚えない", () => {
    const review = createWorkPlanReview()
    review.pass(RETURNED)

    expect(review.standing()).toEqual({ kind: "none" })
  })
})

describe("WorkPlanReview の立ち位置", () => {
  it("受け付けた段取りの残りの段の数を返し、全部済みなら 0", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(1))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
    review.judge(planOf(2))
    review.judge(planOf(3))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 0 })
  })

  it("差し戻したあとは rejected になり、受け付けた呼び出しで応えると消える", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(0))
    review.judge(planOf(2))
    expect(review.standing()).toEqual({ kind: "rejected" })

    review.judge(planOf(1))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
  })

  it("差し戻しの覚えはターンの区切りで戻る", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(0))
    review.judge(planOf(2))
    review.pass({ kind: "turn-finished", outcome: { kind: "completed" } })

    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
  })

  it("最後の段で finished の report が流れると、残りが 0 になる", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(2))
    review.pass(reportOf("finished"))

    expect(review.standing()).toEqual({ kind: "planned", remaining: 0 })
  })

  it("stopped の report と、段が2つ以上残った finished の report では位置が動かない", () => {
    const stopped = createWorkPlanReview()
    stopped.judge(planOf(2))
    stopped.pass(reportOf("stopped"))
    const early = createWorkPlanReview()
    early.judge(planOf(1))
    early.pass(reportOf("finished"))

    expect(stopped.standing()).toEqual({ kind: "planned", remaining: 1 })
    expect(early.standing()).toEqual({ kind: "planned", remaining: 2 })
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
