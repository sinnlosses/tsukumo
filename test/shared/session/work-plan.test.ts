import { describe, expect, it } from "vitest"

import type { DelegateReturn } from "../../../src/shared/session/delegate-return.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
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
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
  }
}

function next(
  phases: readonly WorkPlanEntry[],
  current: number,
  phaseSummary = "",
  finishedInGroup: readonly string[] = [],
): WorkPlan {
  return {
    phases,
    current,
    finishedInGroup,
    phaseSummary,
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
  }
}

describe("parseWorkPlan の段のまとめ", () => {
  it("空白だけのまとめは無いものに畳む", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 0, phaseSummary: " \n" })).toEqual({
      phases: PHASES,
      current: 0,
      finishedInGroup: [],
      phaseSummary: "",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
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

describe("parseWorkPlan の並列の段", () => {
  it("段の名前と並列の段の混ざった並びと、今の並列の段の中で済んだ段を読む", () => {
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

  it("1段だけ・名前の重なる・空白だけの名前を含む並列の段は受け付けない", () => {
    for (const group of [["架空の段B"], ["架空の段B", "架空の段B"], ["架空の段B", " "]]) {
      expect(parseWorkPlan({ phases: ["架空の段A", group], current: 0 })).toBeUndefined()
    }
  })

  it("finishedInGroup は今の並列の段の一部の名前だけを受け付ける", () => {
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

  it("並列の段の中の段が済んだ途中の位置は、まとめが無くても読める", () => {
    expect(
      parseWorkPlan({
        phases: [["架空の段A", "架空の段B"]],
        current: 0,
        finishedInGroup: ["架空の段B"],
      })?.finishedInGroup,
    ).toEqual(["架空の段B"])
  })
})

describe("parseWorkPlan の飛ばした段", () => {
  it("この呼び出しで済んでいる段の名前を読み、省けば空にする", () => {
    expect(
      parseWorkPlan({
        phases: GROUPED,
        current: 1,
        finishedInGroup: ["架空の段C"],
        phaseSummary: "架空のまとめ。",
        skippedPhases: ["架空の段A", "架空の段C"],
      })?.skippedPhases,
    ).toEqual(["架空の段A", "架空の段C"])
    expect(parseWorkPlan({ phases: PHASES, current: 0 })?.skippedPhases).toEqual([])
  })

  it.each([
    ["phases に無い名前", ["架空の段Z"]],
    ["済んでいない段", ["架空の段B"]],
    ["重なる名前", ["架空の段A", "架空の段A"]],
  ])("%s は受け付けない", (_, skippedPhases) => {
    expect(
      parseWorkPlan({ phases: GROUPED, current: 1, phaseSummary: "架空のまとめ。", skippedPhases }),
    ).toBeUndefined()
  })
})

describe("plannedPhasesOf の飛ばした段", () => {
  const skippedPlan = (skippedPhases: readonly string[]) => ({
    phases: PHASES,
    current: 2,
    finishedInGroup: [],
    skippedPhases,
  })

  it("済んだ段のうち名前が skippedPhases にある段だけが skipped で、state は済んだ段のまま", () => {
    const phases = plannedPhasesOf(skippedPlan(["架空の段A"]))

    expect(phases.map((phase) => [phase.state, phase.skipped])).toEqual([
      ["done", true],
      ["done", false],
      ["current", false],
    ])
  })

  it("済んでいない段は名前が skippedPhases にあっても skipped にしない", () => {
    expect(plannedPhasesOf(skippedPlan(["架空の段C"])).map((phase) => phase.skipped)).toEqual([
      false,
      false,
      false,
    ])
  })

  it("飛ばしても済み具合・番号・段の数え方は済んだ段と同じ", () => {
    const plain = skippedPlan([])
    const skipped = skippedPlan(["架空の段B"])

    expect(plannedPhasesOf(skipped).map(({ index, key, state }) => [index, key, state])).toEqual(
      plannedPhasesOf(plain).map(({ index, key, state }) => [index, key, state]),
    )
  })

  it("飛ばした段を済ませた中間レポートは skipped を持ち、work_plan 経由と phase_result 経由で同じになる", () => {
    const range = { kind: "range", first: 1, count: 2 } as const
    const phases = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
    const before: LatestWorkPlan = { kind: "planned", ...next(phases, 1), delegatedRange: range }
    const viaPlan = {
      ...next(phases, 2, "飛ばしたわけ。"),
      delegatedRange: range,
      skippedPhases: ["架空の実装A"],
    }
    const viaReturn = nextWorkPlan(before, {
      kind: "delegate-returned",
      handback: { kind: "phase-skipped", phase: 1, count: 2 },
    })

    expect(viaReturn.kind === "none" ? [] : plannedPhasesOf(viaReturn)).toEqual(
      plannedPhasesOf(viaPlan),
    )
    expect(phaseShiftOf(before, viaPlan).finished).toMatchObject({
      kind: "finished",
      skipped: true,
    })
    expect(phaseShiftOf(before, next(phases, 2, "架空のまとめ。")).finished).toMatchObject({
      kind: "finished",
      skipped: false,
    })
  })
})

describe("並列の段の中の段を済ませる順", () => {
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
      { kind: "finished", label: "3/4 架空の段C", summary: "Cのまとめ。", skipped: false },
      { kind: "finished", label: "2/4 架空の段B", summary: "Bのまとめ。", skipped: false },
    ])
    expect(forward.map((shift) => shift.finished)).toEqual([
      { kind: "finished", label: "2/4 架空の段B", summary: "Bのまとめ。", skipped: false },
      { kind: "finished", label: "3/4 架空の段C", summary: "Cのまとめ。", skipped: false },
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

  // 前・本・後の3群。前は計画（0）、本は段B〜D（1〜3）、後は受け入れ・振り返り・送り出し（4〜6）
  const SPANNED: readonly WorkPlanEntry[] = [
    "架空の計画",
    "架空の段B",
    "架空の段C",
    "架空の段D",
    "架空の受け入れ",
    "架空の振り返り",
    "架空の送り出し",
  ]
  const spannedRange = { kind: "range", first: 1, count: 3 } as const

  it("範囲が無ければ並び全体の通し番号と全体の段の数で数える", () => {
    expect(phaseNumberOf(none, [1], 4)).toEqual({
      kind: "numbered",
      span: "whole",
      ordinals: "2",
      text: "2/4",
    })
  })

  it("範囲があれば前・本・後の群ごとに1から数える", () => {
    expect(phaseNumberOf(spannedRange, [0], 7)).toEqual({
      kind: "numbered",
      span: "lead",
      ordinals: "1",
      text: "1/1",
    })
    expect(phaseNumberOf(spannedRange, [2], 7)).toMatchObject({ span: "delegated", text: "2/3" })
    expect(phaseNumberOf(spannedRange, [4], 7)).toMatchObject({ span: "trail", text: "1/3" })
    expect(phaseNumberOf(spannedRange, [6], 7)).toMatchObject({ span: "trail", text: "3/3" })
  })

  it("並列の段は先頭と末尾の番号を「–」でつなぐ", () => {
    expect(phaseNumberOf(none, [1, 2], 4)).toMatchObject({ ordinals: "2–3", text: "2–3/4" })
    expect(phaseNumberOf(range, [1, 2], 4)).toMatchObject({ ordinals: "1–2", text: "1–2/3" })
  })

  it("段の呼び名・いまの位置は群の名を前に付け、範囲が無ければ付けない", () => {
    const at = (current: number, delegatedRange: WorkPlan["delegatedRange"]): LatestWorkPlan => ({
      kind: "planned",
      ...next(SPANNED, current),
      delegatedRange,
    })
    const plan = { ...next(SPANNED, 4), delegatedRange: spannedRange }
    expect(plannedPhaseTitle(plan, { index: 0, name: "架空の計画" })).toBe("前1. 架空の計画")
    expect(plannedPhaseTitle(plan, { index: 2, name: "架空の段C" })).toBe("本2. 架空の段C")
    expect(plannedPhaseTitle(plan, { index: 5, name: "架空の振り返り" })).toBe(
      "後2. 架空の振り返り",
    )
    expect(workPositionText(at(0, spannedRange))).toBe("前 1/1")
    expect(workPositionText(at(2, spannedRange))).toBe("本 2/3")
    expect(workPositionText(at(4, spannedRange))).toBe("後 1/3")
    expect(workPositionText(at(7, spannedRange))).toBe("後 3/3")
    expect(workPositionText(at(2, none))).toBe("3/7")
    expect(workPositionText(at(7, none))).toBe("7/7")
  })

  it("後ろの群が無い範囲で全部済めば、本の段の数で言う", () => {
    const plan: LatestWorkPlan = { kind: "planned", ...next(GROUPED, 3), delegatedRange: range }
    expect(workPositionText(plan)).toBe("本 3/3")
    expect(workPositionText({ ...plan, current: 1 })).toBe("本 1–2/3")
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

  it("pending は範囲の前だけを数え、範囲の先頭から後ろは番号を持たない", () => {
    const pending = { kind: "pending", first: 1 } as const
    const at = (current: number): LatestWorkPlan => ({
      kind: "planned",
      ...next(GROUPED, current),
      delegatedRange: pending,
    })
    expect(phaseNumberOf(pending, [0], 4)).toMatchObject({ span: "lead", text: "1/1" })
    expect(phaseNumberOf(pending, [1, 2], 4)).toEqual({ kind: "named" })
    expect(workPositionText(at(0))).toBe("前 1/1")
    expect(workPositionText(at(2))).toBe("")
    expect(workPositionText(at(3))).toBe("")
  })

  it("見出しは群の名と番号と名前で言う", () => {
    const withRange: WorkPlan = { ...next(GROUPED, 0), delegatedRange: range }
    expect(phaseLabel(phaseOf(withRange))).toBe("前 1/1 架空の段A")
    expect(phaseLabel(phaseOf({ ...withRange, current: 1 }))).toBe("本 1–2/3 架空の段B・架空の段C")
    expect(phaseLabel(phaseOf(next(GROUPED, 1)))).toBe("2–3/4 架空の段B・架空の段C")
  })
})

function phaseOf(plan: WorkPlan): Extract<WorkPhase, { readonly kind: "phase" }> {
  const phase = currentPhaseOf({ kind: "planned", ...plan })
  if (phase.kind !== "phase") {
    throw new Error("今の段があるワークプランを渡す")
  }
  return phase
}

describe("phaseShiftOf", () => {
  it("段を進めると、終えた段のまとめを出す", () => {
    expect(phaseShiftOf(planned(PHASES, 0), next(PHASES, 1, "架空のまとめ。"))).toEqual({
      finished: {
        kind: "finished",
        label: "1/3 架空の段A",
        summary: "架空のまとめ。",
        skipped: false,
      },
    })
  })

  it("進めながら後ろの段を組み替えても、終えた段を名前で見つける", () => {
    const reordered = ["架空の段A", "架空の段D", "架空の段C"]

    expect(phaseShiftOf(planned(PHASES, 0), next(reordered, 1, "架空のまとめ。"))).toEqual({
      finished: {
        kind: "finished",
        label: "1/3 架空の段A",
        summary: "架空のまとめ。",
        skipped: false,
      },
    })
  })

  it("同じ名前の段が並んでも、済んだ同じ名前の段を今の段と取り違えない", () => {
    const repeated = ["架空の検証", "架空の直し", "架空の検証"]

    expect(phaseShiftOf(planned(repeated, 2), next(repeated, 2, "架空のまとめ。"))).toEqual({
      finished: { kind: "none" },
    })
    expect(phaseShiftOf(planned(repeated, 0), next(repeated, 1, "架空のまとめ。"))).toEqual({
      finished: {
        kind: "finished",
        label: "1/3 架空の検証",
        summary: "架空のまとめ。",
        skipped: false,
      },
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

  it("まとめ待ちの段が済んだままなら、位置の同じ呼び出しのまとめをその段の中間レポートにする", () => {
    const awaiting: LatestWorkPlan = {
      kind: "planned",
      ...next(PHASES, 1),
      awaitingSummary: { kind: "awaiting", key: "架空の段A\u00000" },
    }

    expect(phaseShiftOf(awaiting, next(PHASES, 1, "架空のまとめ。"))).toEqual({
      finished: {
        kind: "finished",
        label: "1/3 架空の段A",
        summary: "架空のまとめ。",
        skipped: false,
      },
    })
    expect(phaseShiftOf(awaiting, next(PHASES, 1)).finished).toEqual({ kind: "none" })
    expect(phaseShiftOf(awaiting, next(PHASES, 0, "架空のまとめ。")).finished).toEqual({
      kind: "none",
    })
    expect(phaseShiftOf(planned(PHASES, 1), next(PHASES, 1, "架空のまとめ。")).finished).toEqual({
      kind: "none",
    })
  })

  it("依頼で最初のワークプランと、全部の段を終えたワークプランでは何も出さない", () => {
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

  it("最後の並列の段は、残りが1段になってから閉じる", () => {
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

  it("count が無ければ pending に読む", () => {
    expect(read({ first: 1 })).toEqual({ kind: "pending", first: 1 })
  })

  it("範囲の端が並列の段の端に揃っていれば、範囲の中に並列の段を含んでよい", () => {
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
    { first: 2 },
    { first: 5 },
    "range",
  ])("並列の段をまたぐ・並びをはみ出す・整数でない範囲は受け付けない: %j", (range) => {
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
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
  })
  const phaseDone = (phase: number, count = 2, summary = "架空の要約。"): DelegateReturn => ({
    kind: "phase-done",
    phase,
    count,
    summary,
  })
  const returned = (plan: LatestWorkPlan, handback: DelegateReturn): LatestWorkPlan =>
    nextWorkPlan(plan, { kind: "delegate-returned", handback })

  it("phase-done で、phase に当たる今の段を済ませ、要約を段のまとめにする", () => {
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

  it("並列の段の中の段は finishedInGroup に足し、最後の段で current を進めて空にする", () => {
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

  it("範囲の無いワークプランと、止めた返却は動かさない", () => {
    const noRange = planAt(1, SERIAL, [], { kind: "none" })

    expect(returned(noRange, phaseDone(1))).toEqual(noRange)
    expect(returned(planAt(1), { kind: "stopped", phase: 1, count: 2, summary: "架空" })).toEqual(
      planAt(1),
    )
  })

  it("並びの最後の段は返却では済ませない（閉じるのは report）", () => {
    const lastPhase = planAt(1, ["架空の段A", "架空の段B"], [], {
      kind: "range",
      first: 0,
      count: 2,
    })

    expect(returned(lastPhase, phaseDone(2))).toEqual(lastPhase)
  })

  it("phase-skipped は段を済ませて飛ばした段に名前を足し、まとめ待ちにする", () => {
    const skipped = { kind: "phase-skipped", phase: 1, count: 2 } as const

    expect(returned(planAt(1), skipped)).toEqual({
      ...planAt(2),
      skippedPhases: ["架空の実装A"],
      awaitingSummary: { kind: "awaiting", key: "架空の実装A\u00000" },
    })
  })

  it("要約の空の phase-done はまとめ待ちにし、要約があればまとめ待ちにしない", () => {
    expect(returned(planAt(1), phaseDone(1, 2, ""))).toMatchObject({
      current: 2,
      phaseSummary: "",
      skippedPhases: [],
      awaitingSummary: { kind: "awaiting", key: "架空の実装A\u00000" },
    })
    expect(returned(planAt(1), phaseDone(1))).toMatchObject({ awaitingSummary: { kind: "none" } })
  })

  it("phase-skipped も一足飛び・済んだ段・N の食い違い・範囲の無いワークプランでは動かさず、印も付けない", () => {
    const skipped = (phase: number, count = 2) => ({ kind: "phase-skipped", phase, count }) as const
    const noRange = planAt(1, SERIAL, [], { kind: "none" })
    const pending = planAt(1, SERIAL, [], { kind: "pending", first: 1 })

    expect(returned(planAt(1), skipped(2))).toEqual(planAt(1))
    expect(returned(planAt(2), skipped(1))).toEqual(planAt(2))
    expect(returned(planAt(1), skipped(1, 3))).toEqual(planAt(1))
    expect(returned(noRange, skipped(1))).toEqual(noRange)
    expect(returned(pending, skipped(1))).toEqual(pending)
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

describe("nextWorkPlan（範囲を初めて宣言した work-plan）", () => {
  const SERIAL: readonly WorkPlanEntry[] = [
    "架空の計画",
    "架空の実装A",
    "架空の実装B",
    "架空の受け入れ",
  ]
  const range = { kind: "range", first: 1, count: 2 } as const
  const declared = (current: number): WorkPlan => ({
    phases: SERIAL,
    current,
    finishedInGroup: [],
    phaseSummary: "架空の計画を書いた。",
    delegatedRange: range,
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
  })
  const event = (plan: WorkPlan): WorkPlanEvent => ({ kind: "work-plan", ...plan })

  it("pending のあいだは位置を動かさず、返却でも動かない。count 付きで宣言した最初の呼び出しで範囲の前の段を済ませる", () => {
    const pending = { kind: "pending", first: 1 } as const
    const plan = nextWorkPlan(
      planned(SERIAL, 0),
      event({ ...declared(0), delegatedRange: pending }),
    )
    expect(plan).toMatchObject({ current: 0, delegatedRange: pending })
    expect(
      nextWorkPlan(plan, {
        kind: "delegate-returned",
        handback: { kind: "phase-done", phase: 1, count: 2, summary: "架空" },
      }),
    ).toEqual(plan)
    expect(nextWorkPlan(plan, event(declared(0)))).toMatchObject({ current: 1 })
  })

  it("範囲の前の段を済ませ、範囲の先頭の段を今の段にする", () => {
    const plan = nextWorkPlan(planned(SERIAL, 0), event(declared(0)))
    expect(plan).toMatchObject({ current: 1 })
    expect(
      nextWorkPlan(plan, {
        kind: "delegate-returned",
        handback: { kind: "phase-done", phase: 1, count: 2, summary: "架空" },
      }),
    ).toMatchObject({ current: 2 })
  })

  it("範囲を宣言済みなら位置を動かさない", () => {
    const before = nextWorkPlan(planned(SERIAL, 0), event(declared(0)))
    expect(nextWorkPlan(before, event(declared(0)))).toMatchObject({ current: 0 })
  })
})

describe("イベントの並びから畳んだ今のワークプラン", () => {
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
