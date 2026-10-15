import { describe, expect, it } from "vitest"

import { createWorkPlanReview } from "../../../../src/server/session-driver/core/work-plan-review.ts"
import { parseDelegateReturn } from "../../../../src/shared/session/delegate-return.ts"
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
const handback = (message: string, delegate = "toolu_delegate"): SessionEvent => ({
  kind: "delegate-returned",
  delegate,
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

  it("まとまりの段を1回で2つ済ませる呼び出しは差し戻し、途中でまとめが空なら malformed で差し戻す", () => {
    const grouped = ["架空の段A", ["架空の段B", "架空の段C"], "架空の段D"]
    const review = createWorkPlanReview()
    review.judge({ phases: grouped, current: 1, phaseSummary: SUMMARY })

    expect(review.judge({ phases: grouped, current: 2, phaseSummary: SUMMARY }).kind).toBe(
      "skipped-phase",
    )
    expect(review.judge({ phases: grouped, current: 1, finishedInGroup: ["架空の段B"] }).kind).toBe(
      "malformed",
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
    expect(review.judge({ phases: PHASES, current: 1 }).kind).toBe("malformed")
    expect(review.judge({ current: 1, phaseSummary: SUMMARY }).kind).toBe("malformed")
  })

  it("範囲の無い段取りでは、返却が届いても位置は動かず、返却のイベントはそのまま流れ、範囲の無い呼び出しは差し戻す", () => {
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

  it("最後に受けた返却の N と count が違う範囲は差し戻し、揃えれば通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.pass(handback("計画 0/3 | 架空の計画。"))

    expect(review.judge(ranged(1, SUMMARY)).kind).toBe("range-mismatch")
    expect(review.judge(ranged(1, SUMMARY, { first: 1, count: 3 })).kind).toBe("accepted")
  })

  it("形の読める返却を受けたあとの範囲の無い work_plan は差し戻し、範囲を宣言すれば通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))
    review.pass(handback("計画 0/2 | 架空の計画。"))

    expect(review.judge({ ...ranged(1, SUMMARY), delegatedRange: undefined }).kind).toBe(
      "range-missing",
    )
    expect(review.judge(ranged(1, SUMMARY)).kind).toBe("accepted")
  })

  it("pending は返却を受ける前は通り、返却を受けたあとは range-missing で、count 付きへは通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    expect(review.judge(ranged(0, "", { first: 1 })).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "pending", first: 1 })
    review.pass(handback("計画 0/2 | 架空の計画。"))

    expect(review.judge(ranged(0, "", { first: 1 })).kind).toBe("range-missing")
    expect(review.judge(ranged(0)).kind).toBe("accepted")
  })

  it("段のまとめが範囲の外の番号を言う work_plan は差し戻し、範囲が無ければ検査しない", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge(ranged(0))

    expect(review.judge(ranged(1, "段3が済んだ。")).kind).toBe("phase-number")
    expect(review.judge(ranged(1, "段1が済んだ。")).kind).toBe("accepted")
    expect(review.delegatedRange()).toEqual({ kind: "range", first: 1, count: 2 })
    review.pass(REQUEST)
    expect(review.delegatedRange()).toEqual({ kind: "none" })
    review.judge({ phases: FOUR, current: 0 })
    expect(review.judge({ phases: FOUR, current: 1, phaseSummary: "段9が済んだ。" }).kind).toBe(
      "accepted",
    )
  })

  it("返却を受けていない依頼・形の読めない返却だけの依頼では、範囲が無くても通る", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    expect(review.judge({ ...ranged(0), delegatedRange: undefined }).kind).toBe("accepted")
    review.pass(handback("了解しました"))
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

  it("返却で溜まった注記は1回だけ取り出せ、済んだ帯の段と返却後の帯の位置を言う", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))

    expect(review.takeHandbackNote()).toBe(
      "tsukumo の注記（委譲先の返却の本文ではない）:返却 `段 1/2` で帯の 本 1/2 架空の実装A が済んだ。" +
        "帯の今の段は 本 2/2 架空の実装B。帯は範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数え、本の番号は委譲先の段の番号と同じ。セリフで番号を言うのは本の段だけで、前・後の段は名前で言う。",
    )
    expect(review.takeHandbackNote()).toBe("")
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
    review.pass(handback("段 2/2 | 架空の返却B。"))
    review.pass(handback("段 1/2 | 架空の返却A。"))

    const note = review.takeHandbackNote()
    expect(note).toContain("返却 `段 2/2` で帯の 本 2/2 架空の実装B が済んだ。")
    expect(note).toContain("返却 `段 1/2` で帯の 本 1/2 架空の実装A が済んだ。")
    expect(note.match(/帯の今の段は/gu)).toHaveLength(1)
    expect(note).toMatch(/帯の今の段は 後 1\/1 架空の受け入れ。/u)
  })

  it("受け付けた work_plan・依頼・利用者の送ったターンの始まりのあとは、溜めた注記を捨てる", () => {
    const accepted = started()
    accepted.pass(handback("段 1/2 | 架空の返却。"))
    accepted.judge(ranged(2))
    expect(accepted.takeHandbackNote()).toBe("")

    const requested = started()
    requested.pass(handback("段 1/2 | 架空の返却。"))
    requested.pass(REQUEST)
    expect(requested.takeHandbackNote()).toBe("")

    const turnStarted = started()
    turnStarted.pass(handback("段 1/2 | 架空の返却。"))
    turnStarted.pass({ kind: "turn-started" })
    expect(turnStarted.takeHandbackNote()).toBe("")
  })

  it("差し戻した work_plan では注記を捨てない", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))
    review.judge(ranged(3))

    expect(review.takeHandbackNote()).toContain("返却 `段 1/2`")
  })

  it("段取りが無ければ、返却が届いても注記を溜めない", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.pass(handback("段 1/2 | 架空の返却。"))

    expect(review.takeHandbackNote()).toBe("")
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

  it("phase_result で済んだ段では、同じ位置の work_plan に段のまとめが要り、関門は立たない", () => {
    const review = started()
    review.judgeResult(result(1, "finished"))

    expect(review.gateRaised()).toBe(false)
    expect(review.judge(ranged(2)).kind).toBe("malformed")
    expect(review.judge(ranged(2, SUMMARY)).kind).toBe("accepted")
  })

  it("phase_result を呼んだ委譲先の次の返却は1行目を読まず、関門と注記だけを立てて捨て、ほかの委譲先の返却は読む", () => {
    const review = started()
    review.pass({ kind: "phase-result-called", delegate: "toolu_a" })

    expect(review.pass(handback("段 1/2 | 架空の返却。", "toolu_a"))).toEqual([])
    expect(review.gateRaised()).toBe(true)
    expect(review.standing()).toEqual({ kind: "planned", remaining: 3 })
    expect(review.takeHandbackNote()).toContain("返却の1行目は読んでいない。")

    review.pass(handback("段 1/2 | 架空の返却。", "toolu_b"))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
  })

  it("印を外すのは同じ委譲先の次の返却1件だけで、その次の返却は読む", () => {
    const review = started()
    review.pass({ kind: "phase-result-called", delegate: "toolu_a" })
    review.pass(handback("了解", "toolu_a"))

    review.pass(handback("段 1/2 | 架空の返却。", "toolu_a"))
    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
  })

  it("文字の1行目の返却は phase_result が無ければ従来どおり帯を進める", () => {
    const review = started()
    review.pass(handback("段 1/2 | 架空の返却。"))

    expect(review.standing()).toEqual({ kind: "planned", remaining: 2 })
    expect(review.judge(ranged(2)).kind).toBe("accepted")
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
      } else {
        review.pass(event)
      }
    }

    expect(review.standing()).toEqual(standingOf(plan))
  })
})
