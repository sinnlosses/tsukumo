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
  finishedInGroup: [],
  phaseSummary: current > 0 ? SUMMARY : "",
})

const called = (toolUseId: string, current: number): SessionEvent => {
  const { kind: _, ...plan } = planOf(current)
  return { kind: "work-plan-called", toolUseId, plan }
}

const finished = (toolUseId: string, isError: boolean): SessionEvent => ({
  kind: "tool-finished",
  toolUseId,
  content: isError ? "架空の差し戻し" : "ok",
  isError,
})

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const DELEGATED: SessionEvent = {
  kind: "tool-started",
  toolUseId: "toolu_agent",
  name: "Agent",
  input: { prompt: "架空の委譲。", run_in_background: true },
  parentToolUseId: undefined,
}
const handback = (message: string): SessionEvent => ({
  kind: "tool-started",
  toolUseId: `toolu_handback_${message.length}`,
  name: "SubagentHandback",
  input: { message },
  parentToolUseId: "toolu_agent",
})

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

  it("まとまりの段は後ろの番号から1つずつ済ませても通り、残りの数が減っていく", () => {
    const grouped = ["架空の段A", ["架空の段B", "架空の段C"], "架空の段D"]
    const review = createWorkPlanReview()
    const judge = (current: number, finishedInGroup: readonly string[]) =>
      review.judge({ phases: grouped, current, finishedInGroup, phaseSummary: SUMMARY }).kind

    review.judge({ phases: grouped, current: 0 })
    expect(judge(1, [])).toBe("accepted")
    expect(judge(1, ["架空の段C"])).toBe("accepted")
    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
    expect(judge(2, [])).toBe("accepted")
    expect(review.standing()).toEqual({ kind: "planned", remaining: 1 })
  })

  it("まとまりの段を1回で2つ済ませる呼び出しは差し戻し、まとめが空なら empty-summary で差し戻す", () => {
    const grouped = ["架空の段A", ["架空の段B", "架空の段C"], "架空の段D"]
    const review = createWorkPlanReview()
    review.judge({ phases: grouped, current: 1, phaseSummary: SUMMARY })

    expect(review.judge({ phases: grouped, current: 2, phaseSummary: SUMMARY }).kind).toBe(
      "skipped-phase",
    )
    expect(review.judge({ phases: grouped, current: 1, finishedInGroup: ["架空の段B"] }).kind).toBe(
      "malformed",
    )
    review.judge({
      phases: grouped,
      current: 1,
      finishedInGroup: ["架空の段B"],
      phaseSummary: SUMMARY,
    })
    expect(review.judge({ phases: grouped, current: 3 }).kind).toBe("skipped-phase")
  })

  it("段の並びを組み替えた呼び出しは、位置がどこでも通す", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(0))

    expect(
      review.judge({ phases: ["架空の段X", "架空の段Y"], current: 2, phaseSummary: "" }).kind,
    ).toBe("accepted")
  })

  it("同じ段の並びのまま位置を進めてまとめが空なら empty-summary で差し戻し、戻る・組み替えは通す", () => {
    const review = createWorkPlanReview()
    review.judge(planOf(0))
    review.judge(planOf(1))
    review.judge(planOf(2))

    expect(review.judge({ phases: PHASES, current: 3 }).kind).toBe("empty-summary")
    expect(review.judge({ phases: PHASES, current: 0 }).kind).toBe("accepted")
    expect(review.judge({ phases: ["架空の段X", "架空の段Y"], current: 2 }).kind).toBe("accepted")
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
    expect(review.judge({ current: 1, phaseSummary: SUMMARY }).kind).toBe("malformed")
  })

  it("委譲を挟んでも、位置はメインの呼び出しでだけ1段ずつ進み、返却では動かない", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(planOf(0))
    const passed = [
      DELEGATED,
      handback("段 1/1 | 架空の返却。"),
      handback("段 2/1 | 架空"),
    ].flatMap(review.pass)

    expect(passed.map((event) => event.kind)).toEqual([
      "tool-started",
      "tool-started",
      "tool-started",
    ])
    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
    expect(review.judge(planOf(2)).kind).toBe("skipped-phase")
    expect(review.judge(planOf(1)).kind).toBe("accepted")
    review.pass(handback("段 2/2 | 架空の返却。"))
    expect(review.judge(planOf(3)).kind).toBe("skipped-phase")
    expect(review.judge(planOf(2)).kind).toBe("accepted")
    expect(review.standing()).toEqual({ kind: "planned", remaining: 1 })
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
