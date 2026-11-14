import { describe, expect, it } from "vitest"

import { nextWorkPlan } from "../../../src/shared/session/work-plan-fold.ts"
import { phaseShiftOf } from "../../../src/shared/session/work-plan-shift.ts"
import {
  type LatestWorkPlan,
  parseWorkPlan,
  parseWorkPlanClosing,
  plannedPhasesOf,
  type WorkPlanEntry,
} from "../../../src/shared/session/work-plan.ts"
import { GROUPED, next, PHASES } from "../../fixture/work-plan-draft.ts"

describe("parseWorkPlan の段のまとめ", () => {
  it("空白だけのまとめは無いものに畳む", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 0, phaseSummary: " \n" })).toEqual({
      phases: PHASES,
      phaseIds: [],
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

  it("3文以上のまとめもそのまま受け付ける", () => {
    expect(
      parseWorkPlan({ phases: PHASES, current: 1, phaseSummary: "一つ目。二つ目。三つ目。" })
        ?.phaseSummary,
    ).toBe("一つ目。二つ目。三つ目。")
  })

  it("文字列でないまとめは受け付けない", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 0, phaseSummary: 1 })).toBeUndefined()
  })
})

describe("parseWorkPlan の並列のフェーズ", () => {
  it("段の名前と並列のフェーズの混ざった並びと、今の並列のフェーズの中で済んだ段を読む", () => {
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

  it("1段だけ・名前の重なる・空白だけの名前を含む並列のフェーズは受け付けない", () => {
    for (const group of [["架空の段B"], ["架空の段B", "架空の段B"], ["架空の段B", " "]]) {
      expect(parseWorkPlan({ phases: ["架空の段A", group], current: 0 })).toBeUndefined()
    }
  })

  it("finishedInGroup は今の並列のフェーズの一部の名前だけを受け付ける", () => {
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

  it("並列のフェーズの中の段が済んだ途中の位置は、まとめが無くても読める", () => {
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

describe("parseWorkPlan の段の id", () => {
  const withId = (id: string, name: string) => ({ id, name })

  it("{ id, name } の並びは名前の並びに写し、id を並列のフェーズの中も含めて読み順に平らにして持つ", () => {
    expect(
      parseWorkPlan({
        phases: [
          withId("架空のid1", "架空の段A"),
          [withId("架空のid2", "架空の段B"), withId("架空のid3", "架空の段C")],
          withId("架空のid4", "架空の段D"),
        ],
        current: 0,
      }),
    ).toEqual({
      ...next(GROUPED, 0),
      phaseIds: ["架空のid1", "架空のid2", "架空のid3", "架空のid4"],
    })
  })

  it("名前だけの並びは今までどおり読み、phaseIds は空", () => {
    expect(parseWorkPlan({ phases: GROUPED, current: 0 })).toEqual(next(GROUPED, 0))
  })

  it.each([
    ["一部の段にだけ id がある", [withId("架空のid1", "架空の段A"), "架空の段B"]],
    [
      "並列のフェーズの中で id が欠ける",
      [withId("架空のid1", "架空の段A"), [withId("架空のid2", "架空の段B"), "架空の段C"]],
    ],
    ["id が重なる", [withId("架空のid1", "架空の段A"), withId("架空のid1", "架空の段B")]],
    ["空白だけの id を持つ", [withId(" ", "架空の段A"), withId("架空のid2", "架空の段B")]],
  ])("%s並びは受け付けない", (_, phases) => {
    expect(parseWorkPlan({ phases, current: 0 })).toBeUndefined()
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

describe("parseWorkPlan の委譲先のフェーズの範囲", () => {
  const read = (delegatedRange: unknown, phases: readonly WorkPlanEntry[] = GROUPED) =>
    parseWorkPlan({ phases, current: 0, delegatedRange })?.delegatedRange

  it("無ければ none、あれば first と count を読む", () => {
    expect(read(undefined)).toEqual({ kind: "none" })
    expect(read({ first: 1, count: 2 })).toEqual({ kind: "range", first: 1, count: 2 })
  })

  it("count が無ければ pending に読む", () => {
    expect(read({ first: 1 })).toEqual({ kind: "pending", first: 1 })
  })

  it("範囲の端が並列のフェーズの端に揃っていれば、範囲の中に並列のフェーズを含んでよい", () => {
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
  ])("並列のフェーズをまたぐ・並びをはみ出す・整数でない範囲は受け付けない: %j", (range) => {
    expect(parseWorkPlan({ phases: GROUPED, current: 0, delegatedRange: range })).toBeUndefined()
  })
})
