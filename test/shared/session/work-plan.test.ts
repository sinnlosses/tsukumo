import { describe, expect, it } from "vitest"

import type { DelegateReturn } from "../../../src/shared/session/delegate-return.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
} from "../../../src/shared/session/session-state.ts"
import {
  currentPhaseOf,
  completionText,
  currentWorkPlan,
  type LatestWorkPlan,
  nextWorkPlan,
  parseWorkPlan,
  parseWorkPlanClosing,
  phaseFinishedByReturn,
  phaseLabel,
  phaseNumberOf,
  phaseShiftOf,
  plannedPhaseTitle,
  plannedPhasesOf,
  workPositionText,
  type WorkPhase,
  type WorkPlan,
  type WorkPlanEntry,
  type WorkPlanEvent,
} from "../../../src/shared/session/work-plan.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { WORK_PLAN_SCENES } from "../../fixture/work-plan-scene.ts"

// 段の名前とまとめはすべて架空のもの。

const PHASES = ["架空の段A", "架空の段B", "架空の段C"]

const GROUPED: readonly WorkPlanEntry[] = ["架空の段A", ["架空の段B", "架空の段C"], "架空の段D"]

function planned(
  phases: readonly WorkPlanEntry[],
  current: number,
  finishedInGroup: readonly string[] = [],
): LatestWorkPlan {
  return {
    kind: "planned",
    phases,
    current,
    finishedInGroup,
    phaseSummary: "",
    delegatedRange: { kind: "none" },
  }
}

function next(
  phases: readonly WorkPlanEntry[],
  current: number,
  phaseSummary = "",
  finishedInGroup: readonly string[] = [],
): WorkPlan {
  return { phases, current, finishedInGroup, phaseSummary, delegatedRange: { kind: "none" } }
}

describe("parseWorkPlan の段のまとめ", () => {
  it("空白だけのまとめは無いものに畳む", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 0, phaseSummary: " \n" })).toEqual({
      phases: PHASES,
      current: 0,
      finishedInGroup: [],
      phaseSummary: "",
      delegatedRange: { kind: "none" },
    })
  })

  it("途中の位置でまとめが無くても読める（要否は WorkPlanReview が見る）", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 1 })?.phaseSummary).toBe("")
    expect(parseWorkPlan({ phases: PHASES, current: 2, phaseSummary: "  " })?.phaseSummary).toBe("")
  })

  it("最初の位置と、全部の段を終えた位置では、まとめが無くても受け付ける", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 0 })?.phaseSummary).toBe("")
    expect(parseWorkPlan({ phases: PHASES, current: 3 })?.phaseSummary).toBe("")
  })

  it("3文以上のまとめは受け付けず、括弧とインラインコードの中の句点は数えない", () => {
    expect(
      parseWorkPlan({ phases: PHASES, current: 1, phaseSummary: "一つ目。二つ目。三つ目。" }),
    ).toBeUndefined()
    expect(
      parseWorkPlan({
        phases: PHASES,
        current: 1,
        phaseSummary: "架空の形を調べた（中は。を含む）。`a。b` は変えない。",
      })?.phaseSummary,
    ).toBe("架空の形を調べた（中は。を含む）。`a。b` は変えない。")
  })

  it("文字列でないまとめは受け付けない", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 0, phaseSummary: 1 })).toBeUndefined()
  })
})

describe("parseWorkPlan の段のまとまり", () => {
  it("段の名前とまとまりの混ざった並びと、今のまとまりの中で済んだ段を読む", () => {
    expect(
      parseWorkPlan({
        phases: GROUPED,
        current: 1,
        finishedInGroup: ["架空の段C"],
        phaseSummary: "架空のまとめ。",
      }),
    ).toEqual(next(GROUPED, 1, "架空のまとめ。", ["架空の段C"]))
  })

  it("finishedInGroup を持たない前の呼び出しは、空の finishedInGroup として読む", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 1, phaseSummary: "架空のまとめ。" })).toEqual(
      next(PHASES, 1, "架空のまとめ。"),
    )
    expect(parseWorkPlan({ phases: GROUPED, current: 1, phaseSummary: "架空のまとめ。" })).toEqual(
      next(GROUPED, 1, "架空のまとめ。"),
    )
  })

  it("1段だけ・名前の重なる・空白だけの名前を含むまとまりは受け付けない", () => {
    for (const group of [["架空の段B"], ["架空の段B", "架空の段B"], ["架空の段B", " "]]) {
      expect(parseWorkPlan({ phases: ["架空の段A", group], current: 0 })).toBeUndefined()
    }
  })

  it("finishedInGroup は今のまとまりの一部の名前だけを受け付ける", () => {
    const summary = "架空のまとめ。"
    for (const [current, finishedInGroup] of [
      [0, ["架空の段B"]],
      [1, ["架空の段D"]],
      [1, ["架空の段B", "架空の段C"]],
      [1, ["架空の段B", "架空の段B"]],
    ] as const) {
      expect(
        parseWorkPlan({ phases: GROUPED, current, finishedInGroup, phaseSummary: summary }),
      ).toBeUndefined()
    }
  })

  it("まとまりの中の段が済んだ途中の位置は、まとめが無くても読める", () => {
    expect(
      parseWorkPlan({
        phases: [["架空の段A", "架空の段B"]],
        current: 0,
        finishedInGroup: ["架空の段B"],
      })?.finishedInGroup,
    ).toEqual(["架空の段B"])
  })
})

describe("まとまりの段を済ませる順", () => {
  const stateOf = (plan: LatestWorkPlan) =>
    plan.kind === "planned" ? plannedPhasesOf(plan).map((phase) => phase.state) : []

  it("後ろの番号から済ませても、済んだ段は戻らず、全部の段が済みになる", () => {
    const steps = [
      planned(GROUPED, 1),
      planned(GROUPED, 1, ["架空の段C"]),
      planned(GROUPED, 2),
      planned(GROUPED, 3),
    ]

    expect(steps.map(stateOf)).toEqual([
      ["done", "current", "current", "upcoming"],
      ["done", "current", "done", "upcoming"],
      ["done", "done", "done", "current"],
      ["done", "done", "done", "done"],
    ])
  })

  it("済んだ順が前後しても、中間レポートは段ごとに1つずつ、済んだ段の番号で出る", () => {
    const backward = [
      phaseShiftOf(planned(GROUPED, 1), next(GROUPED, 1, "Cのまとめ。", ["架空の段C"])),
      phaseShiftOf(planned(GROUPED, 1, ["架空の段C"]), next(GROUPED, 2, "Bのまとめ。")),
    ]
    const forward = [
      phaseShiftOf(planned(GROUPED, 1), next(GROUPED, 1, "Bのまとめ。", ["架空の段B"])),
      phaseShiftOf(planned(GROUPED, 1, ["架空の段B"]), next(GROUPED, 2, "Cのまとめ。")),
    ]

    expect(backward.map((shift) => shift.finished)).toEqual([
      { kind: "finished", label: "3/4 架空の段C", summary: "Cのまとめ。" },
      { kind: "finished", label: "2/4 架空の段B", summary: "Bのまとめ。" },
    ])
    expect(forward.map((shift) => shift.finished)).toEqual([
      { kind: "finished", label: "2/4 架空の段B", summary: "Bのまとめ。" },
      { kind: "finished", label: "3/4 架空の段C", summary: "Cのまとめ。" },
    ])
  })

  it("今の段が2つ以上なら、今の段は番号と名前をつないで言う", () => {
    expect(currentPhaseOf(planned(GROUPED, 1))).toEqual({
      kind: "phase",
      indexes: [1, 2],
      count: 4,
      name: "架空の段B・架空の段C",
      range: { kind: "none" },
    })
  })
})

describe("phaseNumberOf", () => {
  const none = { kind: "none" } as const
  // GROUPED を平らにすると A=0, B=1, C=2, D=3。範囲は B・C・D（先頭 1、3 段）
  const range = { kind: "range", first: 1, count: 3 } as const

  it("範囲が無ければ通し番号と全体の段の数で数える", () => {
    expect(phaseNumberOf(none, [1], 4)).toEqual({ kind: "numbered", ordinals: "2", text: "2/4" })
  })

  it("並列の段は番号をつなぐ", () => {
    expect(phaseNumberOf(none, [1, 2], 4)).toMatchObject({ ordinals: "2·3", text: "2·3/4" })
    expect(phaseNumberOf(range, [1, 2], 4)).toMatchObject({ ordinals: "1·2", text: "1·2/3" })
  })

  it("範囲の中の段は範囲の先頭からの番号と範囲の段の数で数える", () => {
    expect(phaseNumberOf(range, [1], 4)).toMatchObject({ text: "1/3" })
    expect(phaseNumberOf(range, [3], 4)).toMatchObject({ text: "3/3" })
  })

  it("段の呼び名・いまの位置・済んだ数は、範囲の外の段を数えない", () => {
    const at = (current: number, delegatedRange: WorkPlan["delegatedRange"] = range): WorkPlan => ({
      ...next(GROUPED, current),
      delegatedRange,
    })
    const plan = at(1)
    expect(plannedPhaseTitle(plan, { index: 0, name: "架空の段A" })).toBe("架空の段A")
    expect(plannedPhaseTitle(plan, { index: 2, name: "架空の段C" })).toBe("2. 架空の段C")
    expect(workPositionText({ kind: "planned", ...plan })).toBe("1·2/3")
    expect(workPositionText({ kind: "planned", ...at(0) })).toBe("")
    expect(workPositionText({ kind: "planned", ...at(3) })).toBe("3/3")
    expect(workPositionText({ kind: "planned", ...at(1, none) })).toBe("2·3/4")
    expect(workPositionText({ kind: "planned", ...at(3, none) })).toBe("4/4")
  })

  it("済み具合は範囲の外を含む全部の段で言う（範囲なし・範囲の中だけ済み・全部済み）", () => {
    const at = (current: number, delegatedRange: WorkPlan["delegatedRange"]): WorkPlan => ({
      ...next(GROUPED, current),
      delegatedRange,
    })

    expect(completionText(at(2, none))).toBe("4段のうち3段済み")
    expect(completionText(at(2, range))).toBe("4段のうち3段済み")
    expect(completionText(at(3, range))).toBe("4段すべて済み")
    expect(completionText(at(3, none))).toBe("4段すべて済み")
  })

  it("範囲の前後の段は番号を持たない", () => {
    expect(phaseNumberOf(range, [0], 5)).toEqual({ kind: "named" })
    expect(phaseNumberOf({ kind: "range", first: 1, count: 2 }, [3], 4)).toEqual({ kind: "named" })
  })

  it("見出しは範囲の中なら番号と名前、範囲の外なら名前だけ", () => {
    const withRange: WorkPlan = { ...next(GROUPED, 0), delegatedRange: range }
    expect(phaseLabel(phaseOf(withRange))).toBe("架空の段A")
    expect(phaseLabel(phaseOf({ ...withRange, current: 1 }))).toBe("1·2/3 架空の段B・架空の段C")
  })
})

function phaseOf(plan: WorkPlan): Extract<WorkPhase, { readonly kind: "phase" }> {
  const phase = currentPhaseOf({ kind: "planned", ...plan })
  if (phase.kind !== "phase") {
    throw new Error("今の段がある段取りを渡す")
  }
  return phase
}

describe("phaseShiftOf", () => {
  it("段を進めると、終えた段のまとめを出す", () => {
    expect(phaseShiftOf(planned(PHASES, 0), next(PHASES, 1, "架空のまとめ。"))).toEqual({
      finished: { kind: "finished", label: "1/3 架空の段A", summary: "架空のまとめ。" },
    })
  })

  it("進めながら後ろの段を組み替えても、終えた段を名前で見つける", () => {
    const reordered = ["架空の段A", "架空の段D", "架空の段C"]

    expect(phaseShiftOf(planned(PHASES, 0), next(reordered, 1, "架空のまとめ。"))).toEqual({
      finished: { kind: "finished", label: "1/3 架空の段A", summary: "架空のまとめ。" },
    })
  })

  it("同じ名前の段が並んでも、済んだ同じ名前の段を今の段と取り違えない", () => {
    const repeated = ["架空の検証", "架空の直し", "架空の検証"]

    expect(phaseShiftOf(planned(repeated, 2), next(repeated, 2, "架空のまとめ。"))).toEqual({
      finished: { kind: "none" },
    })
    expect(phaseShiftOf(planned(repeated, 0), next(repeated, 1, "架空のまとめ。"))).toEqual({
      finished: { kind: "finished", label: "1/3 架空の検証", summary: "架空のまとめ。" },
    })
  })

  it("段が戻ったときは、何も出さない", () => {
    expect(phaseShiftOf(planned(PHASES, 2), next(PHASES, 1, "架空のまとめ。"))).toEqual({
      finished: { kind: "none" },
    })
  })

  it("前の今の段が並びから消えたときは、中間レポートを出さない", () => {
    const replaced = ["架空の段D", "架空の段E", "架空の段C"]

    expect(phaseShiftOf(planned(PHASES, 0), next(replaced, 1, "架空のまとめ。")).finished).toEqual({
      kind: "none",
    })
  })

  it("今の段が変わらない組み替え・送り直しでは何も出さない", () => {
    const appended = [...PHASES, "架空の段D"]
    const nothing = { finished: { kind: "none" } }

    expect(phaseShiftOf(planned(PHASES, 1), next(PHASES, 1, "架空のまとめ。"))).toEqual(nothing)
    expect(phaseShiftOf(planned(PHASES, 1), next(appended, 1, "架空のまとめ。"))).toEqual(nothing)
  })

  it("依頼で最初の段取りと、全部の段を終えた段取りでは何も出さない", () => {
    const nothing = { finished: { kind: "none" } }

    expect(phaseShiftOf({ kind: "none" }, next(PHASES, 1, "架空のまとめ。"))).toEqual(nothing)
    expect(phaseShiftOf(planned(PHASES, 2), next(PHASES, 3, "架空のまとめ。"))).toEqual(nothing)
    expect(phaseShiftOf(planned(["架空の段A"], 0), next(["架空の段A"], 1))).toEqual(nothing)
  })
})

describe("parseWorkPlanClosing", () => {
  it("finished と stopped はそのまま読み、無い・形の崩れは none に畳む", () => {
    expect([undefined, "finished", "stopped", "done", 1].map(parseWorkPlanClosing)).toEqual([
      "none",
      "finished",
      "stopped",
      "none",
      "none",
    ])
  })
})

describe("nextWorkPlan（finished の report で閉じる）", () => {
  const closed = (plan: WorkPlan): LatestWorkPlan =>
    nextWorkPlan({ kind: "planned", ...plan }, reportEvent({ workPlanClosing: "finished" }))

  it("最後の段にいれば、段の並びはそのままで全部の段を終えた位置にする", () => {
    expect(closed(next(PHASES, 2, "架空のまとめ。"))).toEqual({
      kind: "planned",
      ...next(PHASES, 3),
    })
  })

  it("段が2つ以上残っている・全部済みの位置からは動かさない", () => {
    expect(closed(next(PHASES, 1, "架空のまとめ。"))).toEqual({
      kind: "planned",
      ...next(PHASES, 1, "架空のまとめ。"),
    })
    expect(closed(next(PHASES, 3))).toEqual({ kind: "planned", ...next(PHASES, 3) })
  })

  it("最後のまとまりは、残りが1段になってから閉じる", () => {
    const group = ["架空の段A", ["架空の段B", "架空の段C"]] as const

    expect(closed(next(group, 1, "架空のまとめ。"))).toEqual({
      kind: "planned",
      ...next(group, 1, "架空のまとめ。"),
    })
    expect(closed(next(group, 1, "架空のまとめ。", ["架空の段B"]))).toEqual({
      kind: "planned",
      ...next(group, 2),
    })
  })
})

describe("parseWorkPlan の委譲先の段の範囲", () => {
  const read = (delegatedRange: unknown, phases: readonly WorkPlanEntry[] = GROUPED) =>
    parseWorkPlan({ phases, current: 0, delegatedRange })?.delegatedRange

  it("無ければ none、あれば first と count を読む", () => {
    expect(read(undefined)).toEqual({ kind: "none" })
    expect(read({ first: 1, count: 2 })).toEqual({ kind: "range", first: 1, count: 2 })
  })

  it("範囲の端が段のまとまりの端に揃っていれば、範囲の中にまとまりを含んでよい", () => {
    expect(read({ first: 0, count: 4 })).toEqual({ kind: "range", first: 0, count: 4 })
    expect(read({ first: 1, count: 3 })).toEqual({ kind: "range", first: 1, count: 3 })
  })

  it.each([
    { first: 1, count: 1 },
    { first: 2, count: 1 },
    { first: 3, count: 2 },
    { first: 0, count: 5 },
    { first: -1, count: 2 },
    { first: 0, count: 0 },
    { first: 0.5, count: 2 },
    { first: 0 },
    "range",
  ])("まとまりをまたぐ・並びをはみ出す・整数でない範囲は受け付けない: %j", (range) => {
    expect(parseWorkPlan({ phases: GROUPED, current: 0, delegatedRange: range })).toBeUndefined()
  })
})

describe("nextWorkPlan（委譲の返却で進める）", () => {
  const RANGE = { kind: "range", first: 1, count: 2 } as const
  const SERIAL: readonly WorkPlanEntry[] = [
    "架空の計画",
    "架空の実装A",
    "架空の実装B",
    "架空の受け入れ",
  ]
  const planAt = (
    current: number,
    phases: readonly WorkPlanEntry[] = SERIAL,
    finishedInGroup: readonly string[] = [],
    delegatedRange: WorkPlan["delegatedRange"] = RANGE,
  ): LatestWorkPlan => ({
    kind: "planned",
    phases,
    current,
    finishedInGroup,
    phaseSummary: "",
    delegatedRange,
  })
  const phaseDone = (phase: number, count = 2, summary = "架空の要約。"): DelegateReturn => ({
    kind: "phase-done",
    phase,
    count,
    summary,
  })
  const returned = (plan: LatestWorkPlan, handback: DelegateReturn): LatestWorkPlan =>
    nextWorkPlan(plan, { kind: "delegate-returned", handback })

  it("段 n/N で、段 n に当たる今の段を済ませ、要約を段のまとめにする", () => {
    expect(returned(planAt(1), phaseDone(1))).toEqual({
      ...planAt(2),
      phaseSummary: "架空の要約。",
    })
    expect(returned(planAt(2), phaseDone(2))).toEqual({
      ...planAt(3),
      phaseSummary: "架空の要約。",
    })
  })

  it("要約は2文に切り詰める", () => {
    expect(returned(planAt(1), phaseDone(1, 2, "一つ目。二つ目。三つ目。"))).toMatchObject({
      phaseSummary: "一つ目。二つ目。",
    })
  })

  it("まとまりの中の段は finishedInGroup に足し、最後の段で current を進めて空にする", () => {
    const grouped: readonly WorkPlanEntry[] = [
      "架空の計画",
      ["架空の実装A", "架空の実装B"],
      "架空の受け入れ",
    ]

    expect(returned(planAt(1, grouped), phaseDone(2))).toMatchObject({
      current: 1,
      finishedInGroup: ["架空の実装B"],
    })
    expect(returned(planAt(1, grouped, ["架空の実装B"]), phaseDone(1))).toMatchObject({
      current: 2,
      finishedInGroup: [],
    })
  })

  it("一足飛び・済んだ段・N の食い違いは動かさない", () => {
    expect(returned(planAt(1), phaseDone(2))).toEqual(planAt(1))
    expect(returned(planAt(2), phaseDone(1))).toEqual(planAt(2))
    expect(returned(planAt(1), phaseDone(1, 3))).toEqual(planAt(1))
  })

  it("範囲の無い段取りと、計画・止めた・形の読めない返却は動かさない", () => {
    const noRange = planAt(1, SERIAL, [], { kind: "none" })

    expect(returned(noRange, phaseDone(1))).toEqual(noRange)
    for (const handback of [
      { kind: "plan", count: 2, summary: "架空" },
      { kind: "stopped", phase: 1, count: 2, summary: "架空" },
      { kind: "unreadable" },
    ] as const) {
      expect(returned(planAt(1), handback)).toEqual(planAt(1))
    }
  })

  it("並びの最後の段は返却では済ませない（閉じるのは report）", () => {
    const lastPhase = planAt(1, ["架空の段A", "架空の段B"], [], {
      kind: "range",
      first: 0,
      count: 2,
    })

    expect(returned(lastPhase, phaseDone(2))).toEqual(lastPhase)
  })

  it("phaseFinishedByReturn は返却で済む帯の段を返し、帯を動かさない返却では unmoved", () => {
    const serial = next(SERIAL, 1)
    const ranged: WorkPlan = { ...serial, delegatedRange: RANGE }
    const UNMOVED = { kind: "unmoved" }

    expect(phaseFinishedByReturn(ranged, phaseDone(1))).toMatchObject({
      kind: "finished",
      phase: { index: 1, name: "架空の実装A" },
    })
    expect(phaseFinishedByReturn(ranged, phaseDone(2))).toEqual(UNMOVED)
    expect(phaseFinishedByReturn(serial, phaseDone(1))).toEqual(UNMOVED)
    expect(
      phaseFinishedByReturn(
        {
          ...next(["架空の段A", "架空の段B"], 1),
          delegatedRange: { kind: "range", first: 0, count: 2 },
        },
        phaseDone(2),
      ),
    ).toEqual(UNMOVED)
    expect(
      phaseFinishedByReturn(ranged, { kind: "stopped", phase: 1, count: 2, summary: "架空" }),
    ).toEqual(UNMOVED)
  })
})

describe("イベントの並びから畳んだ今の段取り", () => {
  const isWorkPlanEvent = (event: SessionEvent): event is WorkPlanEvent =>
    event.kind === "request" ||
    event.kind === "work-plan" ||
    event.kind === "delegate-returned" ||
    event.kind === "report"
  const foldedPlanAfter = (events: readonly SessionEvent[]): LatestWorkPlan =>
    events.reduce<LatestWorkPlan>(
      (plan, event) => (isWorkPlanEvent(event) ? nextWorkPlan(plan, event) : plan),
      { kind: "none" },
    )
  const recordedPlanAfter = (events: readonly SessionEvent[]): LatestWorkPlan =>
    currentWorkPlan(
      events.reduce((state, event) => applySessionEvent(state, event, 0), INITIAL_SESSION_STATE)
        .records,
    )

  it.each(WORK_PLAN_SCENES)("$name", ({ events, plan }) => {
    expect(foldedPlanAfter(events)).toEqual(plan)
    expect(recordedPlanAfter(events)).toEqual(plan)
  })
})
