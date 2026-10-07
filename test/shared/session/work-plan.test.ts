import { describe, expect, it } from "vitest"

import {
  closedByReport,
  currentPhaseOf,
  type LatestWorkPlan,
  parseWorkPlan,
  parseWorkPlanClosing,
  phaseShiftOf,
  plannedPhasesOf,
  type WorkPlan,
  type WorkPlanEntry,
} from "../../../src/shared/session/work-plan.ts"

// 段の名前とまとめはすべて架空のもの。

const PHASES = ["架空の段A", "架空の段B", "架空の段C"]

const GROUPED: readonly WorkPlanEntry[] = ["架空の段A", ["架空の段B", "架空の段C"], "架空の段D"]

function planned(
  phases: readonly WorkPlanEntry[],
  current: number,
  finishedInGroup: readonly string[] = [],
): LatestWorkPlan {
  return { kind: "planned", phases, current, finishedInGroup, phaseSummary: "" }
}

function next(
  phases: readonly WorkPlanEntry[],
  current: number,
  phaseSummary = "",
  finishedInGroup: readonly string[] = [],
): WorkPlan {
  return { phases, current, finishedInGroup, phaseSummary }
}

describe("parseWorkPlan の段のまとめ", () => {
  it("空白だけのまとめは無いものに畳む", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 0, phaseSummary: " \n" })).toEqual({
      phases: PHASES,
      current: 0,
      finishedInGroup: [],
      phaseSummary: "",
    })
  })

  it("途中の位置なのにまとめが無ければ受け付けない", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 1 })).toBeUndefined()
    expect(parseWorkPlan({ phases: PHASES, current: 2, phaseSummary: "  " })).toBeUndefined()
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

  it("まとまりの中の段が済んだ途中の位置では、まとめが無ければ受け付けない", () => {
    expect(
      parseWorkPlan({
        phases: [["架空の段A", "架空の段B"]],
        current: 0,
        finishedInGroup: ["架空の段B"],
      }),
    ).toBeUndefined()
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
    })
  })
})

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

describe("closedByReport", () => {
  it("最後の段にいれば、段の並びはそのままで全部の段を終えた位置にする", () => {
    expect(closedByReport(next(PHASES, 2, "架空のまとめ。"))).toEqual({
      kind: "closed",
      plan: next(PHASES, 3),
    })
  })

  it("段が2つ以上残っている・全部済みの位置からは動かさない", () => {
    expect(closedByReport(next(PHASES, 1, "架空のまとめ。"))).toEqual({ kind: "held" })
    expect(closedByReport(next(PHASES, 3))).toEqual({ kind: "held" })
  })

  it("最後のまとまりは、残りが1段になってから閉じる", () => {
    const group = ["架空の段A", ["架空の段B", "架空の段C"]] as const

    expect(closedByReport(next(group, 1, "架空のまとめ。"))).toEqual({ kind: "held" })
    expect(closedByReport(next(group, 1, "架空のまとめ。", ["架空の段B"]))).toEqual({
      kind: "closed",
      plan: next(group, 2),
    })
  })
})
