import { describe, expect, it } from "vitest"

import {
  PHASE_RESULT_MISSING_HANDBACK_LINE,
  RESULT_CALLED_HANDBACK_LINE,
} from "../../../../src/server/session-driver/core/band-position.ts"
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
import { WORK_PLAN_SCENES } from "../../../fixture/work-plan-scene.ts"

const PHASES = ["架空の段A", "架空の段B", "架空の段C"]
const SUMMARY = "架空のまとめ。"

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

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const DELEGATED: SessionEvent = {
  kind: "tool-started",
  toolUseId: "toolu_agent",
  name: "Agent",
  input: { prompt: "架空の委譲。", run_in_background: true },
  parentToolUseId: undefined,
}
const handedBack = (delegate = "toolu_delegate"): SessionEvent => ({
  kind: "delegate-handed-back",
  delegate,
})
const resultCalled = (delegate: string): SessionEvent => ({ kind: "phase-result-called", delegate })

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

  it("current が要素の数に等しい呼び出しは closed-by-plan で差し戻し、まとまりは1要素に数える", () => {
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

  it("まとまりの段を1回で2つ済ませる呼び出しは差し戻し、途中でまとめが空なら summary-missing で差し戻す", () => {
    const grouped = ["架空の段A", ["架空の段B", "架空の段C"], "架空の段D"]
    const review = createWorkPlanReview()
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
    expect(review.judge(inputOf(2)).kind).toBe("accepted")
  })

  it("形の崩れた引数は malformed で差し戻す", () => {
    const review = createWorkPlanReview()

    expect(review.judge({ phases: PHASES, current: 9 }).kind).toBe("malformed")
    expect(review.judge({ current: 1, phaseSummary: SUMMARY }).kind).toBe("malformed")
  })

  it("途中でまとめが空・まとめが3文以上・その他の崩れは別の種類で差し戻す", () => {
    const review = createWorkPlanReview()
    const threeSentences = "一つ目。二つ目。三つ目。"

    expect(review.judge({ phases: PHASES, current: 1 }).kind).toBe("summary-missing")
    expect(review.judge({ phases: PHASES, current: 1, phaseSummary: " \n" }).kind).toBe(
      "summary-missing",
    )
    expect(review.judge({ phases: PHASES, current: 1, phaseSummary: threeSentences }).kind).toBe(
      "summary-too-long",
    )
    expect(review.judge({ phases: PHASES, current: 9, phaseSummary: threeSentences }).kind).toBe(
      "malformed",
    )
    expect(review.judge({ phases: PHASES, current: 9 }).kind).toBe("malformed")
  })

  it("範囲の無い段取りでは、phase_result を受けても位置は動かず、範囲の無い呼び出しは差し戻す", () => {
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

  it("SubagentHandback は位置を動かさず、段のまとめの無い work_plan は差し戻す", () => {
    const review = started()

    expect(review.pass(handedBack())).toEqual([])

    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
    expect(review.judge(ranged(2)).kind).toBe("summary-missing")
    expect(review.judge(ranged(2, SUMMARY)).kind).toBe("accepted")
  })

  it("並列の phase_result が続けて届いても、1回の work_plan で写せる", () => {
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

    review.judgeResult({ phase: 2, count: 2, outcome: "finished" })
    review.judgeResult({ phase: 1, count: 2, outcome: "finished" })

    expect(review.standing()).toEqual({ kind: "planned", remaining: 1 })
    expect(
      review.judge({
        phases: group,
        current: 2,
        phaseSummary: SUMMARY,
        delegatedRange: { first: 1, count: 2 },
      }).kind,
    ).toBe("accepted")
  })

  it("最後に受けた phase_result の count と範囲の count が違う範囲は差し戻し、揃えれば通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.judgeResult({ phase: 1, count: 3, outcome: "finished" })

    expect(review.judge(ranged(1, SUMMARY)).kind).toBe("range-mismatch")
    expect(review.judge(ranged(1, SUMMARY, { first: 1, count: 3 })).kind).toBe("accepted")
  })

  it("phase_result を受けたあとの範囲の無い work_plan は差し戻し、範囲を宣言すれば通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.judgeResult({ phase: 1, count: 2, outcome: "finished" })

    expect(review.judge({ ...ranged(1, SUMMARY), delegatedRange: undefined }).kind).toBe(
      "range-missing",
    )
    expect(review.judge(ranged(1, SUMMARY)).kind).toBe("accepted")
  })

  it("pending は phase_result を受ける前は通り、受けたあとは range-missing で、count 付きへは通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    expect(review.judge(ranged(0, "", { first: 1 })).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "pending", first: 1 })
    review.judgeResult({ phase: 1, count: 2, outcome: "finished" })

    expect(review.judge(ranged(0, "", { first: 1 })).kind).toBe("range-missing")
    expect(review.judge(ranged(0)).kind).toBe("accepted")
  })

  it("段のまとめの本文は読まず、範囲の外の番号を書いても差し戻さない", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))

    expect(review.judge(ranged(1, "段3が済んだ。階段3の図も直した。")).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "range", first: 1, count: 2 })
  })

  it("phase_result を受けていない依頼・SubagentHandback だけの依頼では、範囲が無くても通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    expect(review.judge({ ...ranged(0), delegatedRange: undefined }).kind).toBe("accepted")
    review.pass(handedBack())
    expect(review.judge({ ...ranged(1, SUMMARY), delegatedRange: undefined }).kind).toBe("accepted")
  })

  it("count を受ける前の範囲は通し、依頼が変わると受けた count を忘れる", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    expect(review.judge(ranged(0)).kind).toBe("accepted")
    review.judgeResult({ phase: 1, count: 3, outcome: "finished" })
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

describe("WorkPlanReview の返却の注記", () => {
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

  it("返却で溜まった注記は1回だけ取り出せ、返却ごとの文と帯の位置を言う", () => {
    const review = started()
    review.pass(resultCalled("toolu_a"))
    review.pass(handedBack("toolu_a"))

    expect(review.takeHandbackNote()).toBe(
      `tsukumo の注記（委譲先の返却の本文ではない）:${RESULT_CALLED_HANDBACK_LINE}${review.bandPosition()}`,
    )
    expect(review.takeHandbackNote()).toBe("")
  })

  it("phase_result を呼ばなかった委譲先の返却は、帯が動いていないと言う", () => {
    const review = started()
    review.pass(handedBack("toolu_a"))

    expect(review.takeHandbackNote()).toContain(PHASE_RESULT_MISSING_HANDBACK_LINE)
  })

  it("並列の返却が続けて届くと、返却ごとの文を重ね、帯の位置の文は末尾に1回だけ付ける", () => {
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
    review.pass(resultCalled("toolu_b"))
    review.pass(handedBack("toolu_b"))
    review.pass(handedBack("toolu_a"))

    const note = review.takeHandbackNote()
    expect(note).toContain(`${RESULT_CALLED_HANDBACK_LINE}${PHASE_RESULT_MISSING_HANDBACK_LINE}`)
    expect(note.match(/帯の今の段は/gu)).toHaveLength(1)
    expect(note).toMatch(/帯の今の段は 本 1–2\/2 架空の実装A・架空の実装B。/u)
  })

  it("受け付けた work_plan・依頼・利用者の送ったターンの始まりのあとは、溜めた注記を捨てる", () => {
    const accepted = started()
    accepted.pass(handedBack())
    accepted.judge(ranged(2, SUMMARY))
    expect(accepted.takeHandbackNote()).toBe("")

    const requested = started()
    requested.pass(handedBack())
    requested.pass(REQUEST)
    expect(requested.takeHandbackNote()).toBe("")

    const turnStarted = started()
    turnStarted.pass(handedBack())
    turnStarted.pass({ kind: "turn-started" })
    expect(turnStarted.takeHandbackNote()).toBe("")
  })

  it("差し戻した work_plan では注記を捨てない", () => {
    const review = started()
    review.pass(handedBack())
    review.judge(ranged(3))

    expect(review.takeHandbackNote()).toContain(PHASE_RESULT_MISSING_HANDBACK_LINE)
  })

  it("段取りが無ければ、返却が届いても注記を溜めない", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.pass(handedBack())

    expect(review.takeHandbackNote()).toBe("")
    expect(review.gateRaised()).toBe(false)
  })
})

describe("WorkPlanReview の phase_result", () => {
  const FOUR = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
  const ranged = (current: number, phaseSummary = "", extra: Record<string, unknown> = {}) => ({
    phases: FOUR,
    current,
    phaseSummary,
    delegatedRange: { first: 1, count: 2 },
    ...extra,
  })
  const started = () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.judge(ranged(1, SUMMARY))
    return review
  }
  const result = (phase: number, outcome: string, count = 2) =>
    outcome === "stopped"
      ? { phase, count, outcome, reason: "架空の理由。" }
      : { phase, count, outcome }
  const plannedOf = (plan: LatestWorkPlan) => {
    if (plan.kind !== "planned") {
      throw new Error("段取りのある判定を渡す")
    }
    return plan
  }
  const movedPlan = (review: ReturnType<typeof createWorkPlanReview>, input: unknown) => {
    const verdict = review.judgeResult(input)
    if (verdict.kind !== "accepted") {
      throw new Error("受け付けられる引数を渡す")
    }
    return { moved: verdict.moved, plan: plannedOf(verdict.plan) }
  }
  /** メインの呼び出しを、結果の届いた `work-plan` のイベントまで流す。 */
  const emitted = (review: ReturnType<typeof createWorkPlanReview>, input: unknown) => {
    const verdict = review.judge(input)
    if (verdict.kind !== "accepted") {
      return verdict.kind
    }
    review.pass({ kind: "work-plan-called", toolUseId: "toolu_w", plan: verdict.plan })
    const [event] = review.pass({
      kind: "tool-finished",
      toolUseId: "toolu_w",
      content: "ok",
      isError: false,
    })
    return event?.kind === "work-plan" ? event.skippedPhases : event?.kind
  }

  it("finished と skipped は段を済ませ、skipped は飛ばした段の印を付け、stopped は動かさない", () => {
    expect(movedPlan(started(), result(1, "finished"))).toMatchObject({
      moved: true,
      plan: { current: 2, skippedPhases: [], awaitingSummary: { kind: "awaiting" } },
    })
    expect(movedPlan(started(), result(1, "skipped"))).toMatchObject({
      moved: true,
      plan: { current: 2, skippedPhases: ["架空の実装A"] },
    })
    expect(movedPlan(started(), result(1, "stopped"))).toMatchObject({
      moved: false,
      plan: { current: 1 },
    })
  })

  it("範囲の外・済んだ段・count の違い・範囲が無い依頼では、帯を動かさず印も付けない", () => {
    const pending = createWorkPlanReview()
    pending.pass(REQUEST)
    pending.judge({ phases: FOUR, current: 0, delegatedRange: { first: 1 } })
    const done = started()
    done.judgeResult(result(1, "finished"))

    for (const [review, input] of [
      [started(), result(2, "skipped")],
      [started(), result(1, "skipped", 3)],
      [done, result(1, "skipped")],
      [pending, result(1, "skipped")],
    ] as const) {
      const { moved, plan } = movedPlan(review, input)
      expect(moved).toBe(false)
      expect(plan.skippedPhases).toEqual([])
    }
  })

  it("形の誤りは malformed で、段取りを動かさない", () => {
    const review = started()

    expect(review.judgeResult({ phase: 3, count: 2, outcome: "finished" }).kind).toBe("malformed")
    expect(review.judgeResult({ phase: 1, count: 2, outcome: "stopped" }).kind).toBe("malformed")
    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
  })

  it("phase_result で済んだ段では、同じ位置の work_plan に段のまとめが要り、委譲ゲートは立たない", () => {
    const review = started()
    review.judgeResult(result(1, "finished"))

    expect(review.gateRaised()).toBe(false)
    expect(review.judge(ranged(2)).kind).toBe("summary-missing")
    expect(review.judge(ranged(2, SUMMARY)).kind).toBe("accepted")
  })

  it("phase_result を呼んだ委譲先の返却は、委譲ゲートと注記だけを立ててイベントを捨て、帯は動かさない", () => {
    const review = started()
    review.pass(resultCalled("toolu_a"))

    expect(review.pass(handedBack("toolu_a"))).toEqual([])
    expect(review.gateRaised()).toBe(true)
    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
    expect(review.takeHandbackNote()).toContain(RESULT_CALLED_HANDBACK_LINE)
  })

  it("phase_result を呼ばなかった委譲先の返却も、帯は動かさず、委譲ゲートと注記だけを立てて捨てる", () => {
    const review = started()
    review.pass(resultCalled("toolu_a"))

    expect(review.pass(handedBack("toolu_b"))).toEqual([])
    expect(review.gateRaised()).toBe(true)
    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
    expect(review.takeHandbackNote()).toContain(PHASE_RESULT_MISSING_HANDBACK_LINE)
  })

  it("phase_result を呼んだ印を外すのは同じ委譲先の次の返却1件だけ", () => {
    const review = started()
    review.pass(resultCalled("toolu_a"))
    review.pass(handedBack("toolu_a"))
    review.takeHandbackNote()

    review.pass(handedBack("toolu_a"))
    expect(review.takeHandbackNote()).toContain(PHASE_RESULT_MISSING_HANDBACK_LINE)
  })

  it("skippedPhases に、前に印なしに済んでいた段を新しく入れる呼び出しは skip-mark-late", () => {
    const review = started()

    expect(review.judge(ranged(2, SUMMARY, { skippedPhases: ["架空の計画"] })).kind).toBe(
      "skip-mark-late",
    )
    expect(review.judge(ranged(2, SUMMARY, { skippedPhases: ["架空の実装A"] })).kind).toBe(
      "accepted",
    )
  })

  it("メインが入れた印をまだ済んでいる段から外す呼び出しは skip-mark-dropped で、済んでいなくなれば印が消える", () => {
    const review = started()
    review.judge(ranged(2, SUMMARY, { skippedPhases: ["架空の実装A"] }))

    expect(review.judge(ranged(3, SUMMARY)).kind).toBe("skip-mark-dropped")
    expect(emitted(review, ranged(3, SUMMARY, { skippedPhases: ["架空の実装A"] }))).toEqual([
      "架空の実装A",
    ])
    expect(emitted(review, ranged(1, SUMMARY))).toEqual([])
  })

  it("phase_result で付いた印は、skippedPhases を省いた呼び出しでも残る", () => {
    const review = started()
    review.judgeResult(result(1, "skipped"))

    expect(emitted(review, ranged(2, SUMMARY))).toEqual(["架空の実装A"])
    expect(emitted(review, ranged(3, SUMMARY))).toEqual(["架空の実装A"])
  })
})

describe("WorkPlanReview の立ち位置", () => {
  it("受け付けた段取りの残りの段の数を返し、全部済みなら 0", () => {
    const review = createWorkPlanReview()
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

describe("WorkPlanReview の今の段取り", () => {
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
