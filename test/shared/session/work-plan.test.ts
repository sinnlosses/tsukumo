import { describe, expect, it } from "vitest"

import {
  advancedByReturn,
  closedByReport,
  type LatestWorkPlan,
  parseWorkPlan,
  parseWorkPlanClosing,
  phaseShiftOf,
  type WorkPlan,
} from "../../../src/shared/session/work-plan.ts"

// 段の名前とまとめはすべて架空のもの。

const PHASES = ["架空の段A", "架空の段B", "架空の段C"]

function planned(phases: readonly string[], current: number): LatestWorkPlan {
  return { kind: "planned", phases, current, phaseSummary: "" }
}

function next(phases: readonly string[], current: number, phaseSummary = ""): WorkPlan {
  return { phases, current, phaseSummary }
}

describe("parseWorkPlan の段のまとめ", () => {
  it("空白だけのまとめは無いものに畳む", () => {
    expect(parseWorkPlan({ phases: PHASES, current: 0, phaseSummary: " \n" })).toEqual({
      phases: PHASES,
      current: 0,
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

describe("advancedByReturn", () => {
  const DELEGATE_PHASES = ["計画", "架空の段1", "架空の段2", "架空の段3", "受け入れ"]
  const returnOf = (finishedPhase: number, summary = "架空のまとめ。") => ({
    finishedPhase,
    phaseCount: 3,
    summary,
  })

  it("段の並びはそのままで今の段を返却の番号 + 1 にし、返却の文を済んだ段のまとめにする", () => {
    expect(advancedByReturn(next(DELEGATE_PHASES, 0), returnOf(0, "架空の形が分かった。"))).toEqual(
      { kind: "advanced", plan: next(DELEGATE_PHASES, 1, "架空の形が分かった。") },
    )
  })

  it("止めた返却を挟んで1段遅れていても、番号の返却で委譲先の段に揃い、最後は受け入れに着く", () => {
    const skipped = advancedByReturn(next(DELEGATE_PHASES, 2, "架空。"), returnOf(3))

    expect(skipped).toEqual({ kind: "advanced", plan: next(DELEGATE_PHASES, 4, "架空のまとめ。") })
  })

  it("同じ返却の2回目と古い番号の返却では動かさない", () => {
    expect(advancedByReturn(next(DELEGATE_PHASES, 2, "架空。"), returnOf(1))).toEqual({
      kind: "held",
    })
    expect(advancedByReturn(next(DELEGATE_PHASES, 3, "架空。"), returnOf(1))).toEqual({
      kind: "held",
    })
  })

  it("受け入れより先と、全部済みの位置へは進めない", () => {
    expect(advancedByReturn(next(DELEGATE_PHASES, 4, "架空。"), returnOf(4))).toEqual({
      kind: "held",
    })
    expect(advancedByReturn(next(DELEGATE_PHASES, 5), returnOf(3))).toEqual({ kind: "held" })
  })

  it("計画の返却は段の数が帯と合わなくても、今の段が計画のときだけ1へ進む", () => {
    const short = ["計画", "受け入れ"]

    expect(advancedByReturn(next(short, 0), returnOf(0))).toEqual({
      kind: "advanced",
      plan: next(short, 1, "架空のまとめ。"),
    })
    expect(advancedByReturn(next(DELEGATE_PHASES, 1, "架空。"), returnOf(0))).toEqual({
      kind: "held",
    })
  })

  it("段 n（n が1以上）の返却は、委譲先の段の数が帯と合わないと動かさない", () => {
    expect(advancedByReturn(next(DELEGATE_PHASES, 0), { ...returnOf(1), phaseCount: 2 })).toEqual({
      kind: "held",
    })
  })

  it("返却の文が2文を超えた分は切り詰める（括弧と inline code の中の句点では割らない）", () => {
    const advance = advancedByReturn(
      next(DELEGATE_PHASES, 0),
      returnOf(0, "架空の1文目（中は。を含む）。`a。b` の2文目！架空の3文目。架空の4文目"),
    )

    expect(advance.kind === "advanced" && advance.plan.phaseSummary).toBe(
      "架空の1文目（中は。を含む）。`a。b` の2文目！",
    )
  })

  it("進めた段取りは前の段取りと比べて、済んだ段の中間レポートになる", () => {
    const advance = advancedByReturn(next(DELEGATE_PHASES, 1), returnOf(1))

    expect(
      advance.kind === "advanced" && phaseShiftOf(planned(DELEGATE_PHASES, 1), advance.plan),
    ).toEqual({
      finished: { kind: "finished", label: "2/5 架空の段1", summary: "架空のまとめ。" },
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
})
