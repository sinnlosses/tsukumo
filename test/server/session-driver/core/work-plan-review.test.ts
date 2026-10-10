import { describe, expect, it } from "vitest"

import { createWorkPlanReview } from "../../../../src/server/session-driver/core/work-plan-review.ts"
import { parseDelegateReturn } from "../../../../src/shared/session/delegate-return.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import type { WorkPlanClosing } from "../../../../src/shared/session/work-plan.ts"
import { reportEvent } from "../../../fixture/report-event.ts"

const PHASES = ["架空の段A", "架空の段B", "架空の段C"]
const SUMMARY = "架空のまとめ。"

const planOf = (current: number): Extract<SessionEvent, { kind: "work-plan" }> => ({
  kind: "work-plan",
  delegatedRange: { kind: "none" },
  phases: PHASES,
  current,
  finishedInGroup: [],
  phaseSummary: current > 0 ? SUMMARY : "",
})

/** `work_plan` ツールの引数の形（範囲を渡さない）。 */
const inputOf = (current: number) => {
  const { kind: _, delegatedRange: __, ...input } = planOf(current)
  return input
}

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
  kind: "delegate-returned",
  handback: parseDelegateReturn(message),
})

const reportOf = (workPlanClosing: WorkPlanClosing): SessionEvent =>
  reportEvent({ workPlanClosing })

describe("WorkPlanReview の判定", () => {
  it("同じ段の並びのまま位置を2つ以上進めると差し戻し、1つずつなら通す", () => {
    const review = createWorkPlanReview()

    expect(review.judge(inputOf(0)).kind).toBe("accepted")
    expect(review.judge(inputOf(2)).kind).toBe("skipped-phase")
    expect(review.judge(inputOf(1)).kind).toBe("accepted")
    expect(review.judge(inputOf(2)).kind).toBe("accepted")
    expect(review.judge(inputOf(3)).kind).toBe("accepted")
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
    review.judge(inputOf(0))

    expect(
      review.judge({ phases: ["架空の段X", "架空の段Y"], current: 2, phaseSummary: "" }).kind,
    ).toBe("accepted")
  })

  it("同じ段の並びのまま位置を進めてまとめが空なら empty-summary で差し戻し、戻る・組み替えは通す", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))
    review.judge(inputOf(1))
    review.judge(inputOf(2))

    expect(review.judge({ phases: PHASES, current: 3 }).kind).toBe("empty-summary")
    expect(review.judge({ phases: PHASES, current: 0 }).kind).toBe("accepted")
    expect(review.judge({ phases: ["架空の段X", "架空の段Y"], current: 2 }).kind).toBe("accepted")
  })

  it("依頼のあとは、前の位置を忘れる", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(0))
    expect(review.judge(inputOf(2)).kind).toBe("skipped-phase")
    review.pass(REQUEST)
    expect(review.judge(inputOf(2)).kind).toBe("accepted")
  })

  it("形の崩れた引数は malformed で差し戻す", () => {
    const review = createWorkPlanReview()

    expect(review.judge({ phases: PHASES, current: 9 }).kind).toBe("malformed")
    expect(review.judge({ phases: PHASES, current: 1 }).kind).toBe("malformed")
    expect(review.judge({ current: 1, phaseSummary: SUMMARY }).kind).toBe("malformed")
  })

  it("範囲の無い段取りでは、返却が届いても位置は動かず、返却のイベントはそのまま流れる", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(inputOf(0))
    const passed = [
      DELEGATED,
      handback("段 1/1 | 架空の返却。"),
      handback("段 2/1 | 架空"),
    ].flatMap(review.pass)

    expect(passed.map((event) => event.kind)).toEqual([
      "tool-started",
      "delegate-returned",
      "delegate-returned",
    ])
    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
    expect(review.judge(inputOf(2)).kind).toBe("skipped-phase")
    expect(review.judge(inputOf(1)).kind).toBe("accepted")
  })
})

describe("WorkPlanReview の委譲の返却", () => {
  const FOUR = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
  const RANGE = { first: 1, count: 2 }
  const ranged = (current: number, phaseSummary = "", range: unknown = RANGE) => ({
    phases: FOUR,
    current,
    phaseSummary,
    delegatedRange: range,
  })
  const started = () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.judge(ranged(1, SUMMARY))
    return review
  }

  it("返却で覚えた位置が進み、メインが同じ位置を渡すなら段のまとめが無くても通る", () => {
    const review = started()

    review.pass(handback("段 1/2 | 架空の返却。"))

    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
    expect(review.judge(ranged(2)).kind).toBe("accepted")
    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
  })

  it("返却で進んだ位置と違う位置では、段のまとめが無ければ差し戻す", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))

    expect(review.judge(ranged(3)).kind).toBe("malformed")
    expect(review.judge(ranged(3, SUMMARY)).kind).toBe("accepted")
    expect(review.judge(ranged(2, SUMMARY)).kind).toBe("accepted")
  })

  it("同じ位置を渡したあとは、まとめの無い同じ位置をもう一度は通さない（返却が来ていないため）", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))
    review.judge(ranged(2))

    expect(review.judge(ranged(3)).kind).toBe("malformed")
  })

  it("一足飛び・済んだ段・形の読めない返却では位置が動かない", () => {
    const review = started()

    review.pass(handback("段 2/2 | 架空の一足飛び。"))
    review.pass(handback("了解しました"))
    review.pass(handback("止めた 1/2 | 架空の理由。"))

    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
    expect(review.judge(ranged(1, SUMMARY)).kind).toBe("accepted")
  })

  it("並列の返却が続けて届いても、1回の work_plan で写せる", () => {
    const review = createWorkPlanReview()
    const group = ["架空の計画", ["架空の実装A", "架空の実装B"], "架空の受け入れ"]
    review.pass(REQUEST)
    review.judge({ phases: group, current: 0 })
    review.judge({
      phases: group,
      current: 1,
      phaseSummary: SUMMARY,
      delegatedRange: { first: 1, count: 2 },
    })

    review.pass(handback("段 2/2 | 架空の返却B。"))
    review.pass(handback("段 1/2 | 架空の返却A。"))

    expect(review.standing()).toEqual({ kind: "planned", remaining: 1 })
    expect(
      review.judge({ phases: group, current: 2, delegatedRange: { first: 1, count: 2 } }).kind,
    ).toBe("accepted")
  })

  it("最後に受けた返却の N と count が違う範囲は差し戻し、揃えるか範囲を省けば通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.pass(handback("計画 0/3 | 架空の計画。"))

    expect(review.judge(ranged(1, SUMMARY)).kind).toBe("range-mismatch")
    expect(review.judge(ranged(1, SUMMARY, { first: 1, count: 3 })).kind).toBe("accepted")
    expect(review.judge({ ...ranged(1, SUMMARY), delegatedRange: undefined }).kind).toBe("accepted")
  })

  it("N を受ける前の範囲は通し、依頼が変わると受けた N を忘れる", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    expect(review.judge(ranged(0)).kind).toBe("accepted")
    review.pass(handback("計画 0/3 | 架空の計画。"))
    review.pass(REQUEST)

    expect(review.judge(ranged(0)).kind).toBe("accepted")
  })

  it("範囲が並びをはみ出す・端がまとまりをまたぐ呼び出しは malformed", () => {
    const review = createWorkPlanReview()

    expect(review.judge(ranged(0, "", { first: 3, count: 2 })).kind).toBe("malformed")
    expect(
      review.judge({
        phases: ["架空の計画", ["架空の実装A", "架空の実装B"]],
        current: 0,
        delegatedRange: { first: 0, count: 2 },
      }).kind,
    ).toBe("malformed")
  })
})

describe("WorkPlanReview の立ち位置", () => {
  it("受け付けた段取りの残りの段の数を返し、全部済みなら 0", () => {
    const review = createWorkPlanReview()
    review.judge(inputOf(1))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
    review.judge(inputOf(2))
    review.judge(inputOf(3))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 0 })
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
    review.judge(inputOf(2))
    review.pass(reportOf("finished"))

    expect(review.standing()).toEqual({ kind: "planned", remaining: 0 })
  })

  it("stopped の report と、段が2つ以上残った finished の report では位置が動かない", () => {
    const stopped = createWorkPlanReview()
    stopped.judge(inputOf(2))
    stopped.pass(reportOf("stopped"))
    const early = createWorkPlanReview()
    early.judge(inputOf(1))
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

describe("WorkPlanReview の関門の印", () => {
  const FOUR = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
  const ranged = (current: number, phaseSummary = "") => ({
    phases: FOUR,
    current,
    phaseSummary,
    delegatedRange: { first: 1, count: 2 },
  })
  const started = () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.judge(ranged(1, SUMMARY))
    return review
  }

  it("段取りを受け付けた依頼で返却が届くと立ち、形の読めない返却・止めた・一足飛びでも立つ", () => {
    for (const message of [
      "段 1/2 | 架空の返却。",
      "了解しました",
      "止めた 1/2 | 架空の理由。",
      "段 2/2 | 架空の一足飛び。",
    ]) {
      const review = started()
      review.pass(handback(message))
      expect(review.gateRaised()).toBe(true)
    }
  })

  it("段取りを受け付けていない依頼の返却では立たない", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)

    review.pass(handback("段 1/2 | 架空の返却。"))

    expect(review.gateRaised()).toBe(false)
  })

  it("受け付けた work_plan で下り、差し戻された work_plan では下りない", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))

    expect(review.judge(ranged(3)).kind).toBe("malformed")
    expect(review.gateRaised()).toBe(true)
    expect(review.judge(ranged(2)).kind).toBe("accepted")
    expect(review.gateRaised()).toBe(false)
  })

  it("続けて届いた返却も、1回の work_plan で下りる", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))
    review.pass(handback("段 2/2 | 架空の返却。"))

    expect(review.judge(ranged(3, SUMMARY)).kind).toBe("accepted")
    expect(review.gateRaised()).toBe(false)
  })

  it("止めた返却は、同じ位置のまま work_plan を呼べば下りる", () => {
    const review = started()
    review.pass(handback("止めた 1/2 | 架空の理由。"))

    expect(review.judge(ranged(1, SUMMARY)).kind).toBe("accepted")
    expect(review.gateRaised()).toBe(false)
  })

  it("次の依頼で下りる", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))

    review.pass(REQUEST)

    expect(review.gateRaised()).toBe(false)
  })
})
