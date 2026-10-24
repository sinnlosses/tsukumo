import { describe, expect, it } from "vitest"

import { createWorkPlanReview } from "../../../../src/server/session-driver/core/work-plan-review.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import {
  finishedPhaseCount,
  type LatestWorkPlan,
  phaseCount,
  type WorkPlanClosing,
  type WorkPlanStanding,
} from "../../../../src/shared/session/work-plan.ts"
import { reportEvent } from "../../../fixture/report-event.ts"
import { handedBack, REQUEST, SUMMARY } from "../../../fixture/work-plan-review.ts"
import { WORK_PLAN_SCENES } from "../../../fixture/work-plan-scene.ts"

const PHASES = ["架空の段A", "架空の段B", "架空の段C"]

const planOf = (current: number): Extract<SessionEvent, { kind: "work-plan" }> => ({
  kind: "work-plan",
  delegatedRange: { kind: "none" },
  phases: PHASES,
  current,
  finishedInGroup: [],
  phaseSummary: current > 0 ? SUMMARY : "",
  skippedPhases: [],
  awaitingSummary: { kind: "none" },
})

/** `work_plan` ツールの引数の形（範囲を渡さない）。 */
const inputOf = (current: number) => {
  const { kind: _, delegatedRange: __, awaitingSummary: ___, ...input } = planOf(current)
  return input
}

const DELEGATED: SessionEvent = {
  kind: "tool-started",
  toolUseId: "toolu_agent",
  name: "Agent",
  input: { prompt: "架空の委譲。", run_in_background: true },
  parentToolUseId: undefined,
}

const reportOf = (workPlanClosing: WorkPlanClosing): SessionEvent =>
  reportEvent({ workPlanClosing })

describe("WorkPlanReview の判定", () => {
  it("同じ段の並びのまま位置を2つ以上進めると差し戻し、1つずつなら通す", () => {
    const review = createWorkPlanReview()

    expect(review.judge(inputOf(0)).kind).toBe("accepted")
    expect(review.judge(inputOf(2)).kind).toBe("skipped-phase")
    expect(review.judge(inputOf(1)).kind).toBe("accepted")
    expect(review.judge(inputOf(2)).kind).toBe("accepted")
  })

  it("current が要素の数に等しい呼び出しは closed-by-plan で差し戻し、並列の段は1要素に数える", () => {
    const review = createWorkPlanReview()
    const group = ["架空の計画", ["架空の実装A", "架空の実装B"], "架空の受け入れ"]
    review.judge({ phases: group, current: 0 })

    expect(review.judge({ phases: group, current: 3, phaseSummary: SUMMARY }).kind).toBe(
      "closed-by-plan",
    )
    expect(review.judge({ phases: group, current: 2, phaseSummary: SUMMARY }).kind).toBe(
      "skipped-phase",
    )
    expect(review.judge({ phases: group, current: 1, phaseSummary: SUMMARY }).kind).toBe("accepted")
    expect(
      review.judge({
        phases: group,
        current: 1,
        finishedInGroup: ["架空の実装A"],
        phaseSummary: SUMMARY,
      }).kind,
    ).toBe("accepted")
    expect(review.judge({ phases: group, current: 2, phaseSummary: SUMMARY }).kind).toBe("accepted")
    expect(review.judge({ phases: PHASES, current: 3, phaseSummary: SUMMARY }).kind).toBe(
      "closed-by-plan",
    )
  })

  it("並列の段の中の段は後ろの番号から1つずつ済ませても通り、残りの数が減っていく", () => {
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

  it("並列の段の中の段を1回で2つ済ませる呼び出しは差し戻し、途中でまとめが空なら summary-missing で差し戻す", () => {
    const grouped = ["架空の段A", ["架空の段B", "架空の段C"], "架空の段D"]
    const review = createWorkPlanReview()
    review.judge({ phases: grouped, current: 0 })
    review.judge({ phases: grouped, current: 1, phaseSummary: SUMMARY })

    expect(review.judge({ phases: grouped, current: 2, phaseSummary: SUMMARY }).kind).toBe(
      "skipped-phase",
    )
    expect(review.judge({ phases: grouped, current: 1, finishedInGroup: ["架空の段B"] }).kind).toBe(
      "summary-missing",
    )
  })

  it("段の並びを組み替えた呼び出しは、位置がどこでも通す", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))

    expect(
      review.judge({ phases: ["架空の段X", "架空の段Y"], current: 1, phaseSummary: SUMMARY }).kind,
    ).toBe("accepted")
  })

  it("位置を戻す呼び出しと段の並びの組み替えは、まとめが空でも通す", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))
    review.judge(inputOf(1))

    expect(review.judge({ phases: PHASES, current: 0 }).kind).toBe("accepted")
    expect(review.judge({ phases: ["架空の段X", "架空の段Y"], current: 0 }).kind).toBe("accepted")
  })

  it("依頼のあとは、前の位置を忘れる", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))
    expect(review.judge(inputOf(2)).kind).toBe("skipped-phase")
    review.pass(REQUEST)
    expect(review.judge(inputOf(0)).kind).toBe("accepted")
    expect(review.judge(inputOf(1)).kind).toBe("accepted")
  })

  it("その依頼の最初が範囲の無い current 1 以上なら late-start で差し戻し、request のあとはまた最初として判定する", () => {
    const review = createWorkPlanReview()

    expect(review.judge(inputOf(1)).kind).toBe("late-start")
    expect(review.standing()).toEqual({ kind: "rejected" })
    expect(review.judge(inputOf(0)).kind).toBe("accepted")
    expect(review.judge(inputOf(1)).kind).toBe("accepted")

    review.pass(REQUEST)
    expect(review.judge(inputOf(1)).kind).toBe("late-start")
  })

  it("最初が current 0 の呼び出しと、最初が範囲付きで current 1 以上の呼び出しは通す", () => {
    const first = createWorkPlanReview()
    expect(first.judge(inputOf(0)).kind).toBe("accepted")

    const ranged = createWorkPlanReview()
    expect(ranged.judge({ ...inputOf(1), delegatedRange: { first: 1, count: 2 } }).kind).toBe(
      "accepted",
    )
  })

  it("受け付け済みの依頼の2回目以降は current 1 以上でも late-start にしない", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))

    expect(review.judge(inputOf(1)).kind).toBe("accepted")
  })

  it("形の崩れた引数は malformed で差し戻す", () => {
    const review = createWorkPlanReview()

    expect(review.judge({ phases: PHASES, current: 9 }).kind).toBe("malformed")
    expect(review.judge({ current: 1, phaseSummary: SUMMARY }).kind).toBe("malformed")
  })

  it("途中でまとめが空なら summary-missing、3文以上でも受け付け、その他の崩れは malformed で差し戻す", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))
    const threeSentences = "一つ目。二つ目。三つ目。"

    expect(review.judge({ phases: PHASES, current: 1 }).kind).toBe("summary-missing")
    expect(review.judge({ phases: PHASES, current: 1, phaseSummary: " \n" }).kind).toBe(
      "summary-missing",
    )
    expect(review.judge({ phases: PHASES, current: 1, phaseSummary: threeSentences }).kind).toBe(
      "accepted",
    )
    expect(review.judge({ phases: PHASES, current: 9, phaseSummary: threeSentences }).kind).toBe(
      "malformed",
    )
    expect(review.judge({ phases: PHASES, current: 9 }).kind).toBe("malformed")
  })

  it("範囲の無いワークプランでは、phase_result を受けても位置は動かず、範囲の無い呼び出しは差し戻す", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(inputOf(0))
    const passed = [DELEGATED, handedBack()].flatMap(review.pass)
    review.judgeResult({ phase: 1, count: 1, outcome: "finished" })

    expect(passed.map((event) => event.kind)).toEqual(["tool-started"])
    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
    expect(review.judge(inputOf(2)).kind).toBe("range-missing")
    expect(review.judge(inputOf(1)).kind).toBe("range-missing")
  })
})

describe("WorkPlanReview の立ち位置", () => {
  it("受け付けたワークプランの残りの段の数を返し、全部済みなら 0", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))
    review.judge(inputOf(1))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
    review.judge(inputOf(2))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 1 })
  })

  it("差し戻したあとは rejected になり、受け付けた呼び出しで応えると消える", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))
    review.judge(inputOf(2))
    expect(review.standing()).toEqual({ kind: "rejected" })

    review.judge(inputOf(1))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
  })

  it("差し戻しの覚えはターンの区切りで戻る", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))
    review.judge(inputOf(2))
    review.pass({ kind: "turn-finished", outcome: { kind: "completed" } })

    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
  })

  it("最後の段で finished の report が流れると、残りが 0 になる", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))
    review.judge(inputOf(1))
    review.judge(inputOf(2))
    review.pass(reportOf("finished"))

    expect(review.standing()).toEqual({ kind: "planned", remaining: 0 })
  })

  it("stopped の report と、段が2つ以上残った finished の report では位置が動かない", () => {
    const stopped = createWorkPlanReview()
    stopped.judge(inputOf(0))
    stopped.judge(inputOf(1))
    stopped.judge(inputOf(2))
    stopped.pass(reportOf("stopped"))
    const early = createWorkPlanReview()
    early.judge(inputOf(0))
    early.judge(inputOf(1))
    early.pass(reportOf("finished"))

    expect(stopped.standing()).toEqual({ kind: "planned", remaining: 1 })
    expect(early.standing()).toEqual({ kind: "planned", remaining: 2 })
  })
})

describe("WorkPlanReview の今のワークプラン", () => {
  const standingOf = (plan: LatestWorkPlan): WorkPlanStanding =>
    plan.kind === "none"
      ? { kind: "none" }
      : { kind: "planned", remaining: phaseCount(plan.phases) - finishedPhaseCount(plan) }

  it.each(WORK_PLAN_SCENES)("$name", ({ events, plan }) => {
    const review = createWorkPlanReview()
    for (const event of events) {
      if (event.kind === "work-plan") {
        const { kind: _, delegatedRange, ...input } = event
        expect(
          review.judge(delegatedRange.kind === "range" ? { ...input, delegatedRange } : input).kind,
        ).toBe("accepted")
      } else if (event.kind === "delegate-returned") {
        const { handback } = event
        if (handback.kind === "phase-done") {
          review.judgeResult({ phase: handback.phase, count: handback.count, outcome: "finished" })
        }
      } else {
        review.pass(event)
      }
    }

    expect(review.standing()).toEqual(standingOf(plan))
  })
})
