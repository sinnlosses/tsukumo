import { describe, expect, it } from "vitest"

import {
  type DelegateSignal,
  delegatedPhaseShiftOf,
  delegatedWorkPlan,
  type LatestWorkPlan,
  parseWorkPlan,
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

describe("delegatedWorkPlan", () => {
  it("段の数が合わない前の段取りからは、計画・同じ名前の段・受け入れで引き、合図の段の次を今にする", () => {
    const expected = {
      phases: ["計画", "実装", "実装", "実装", "受け入れ"],
      current: 2,
      phaseSummary: "",
    }

    expect(delegatedWorkPlan({ kind: "none" }, signal(1, 3))).toEqual(expected)
    expect(delegatedWorkPlan(planned(PHASES, 1), signal(1, 3))).toEqual(expected)
  })

  it("前の段取りが合図の段の数に計画と受け入れを足した数なら、その名前を借りる", () => {
    const named = ["架空の計画", "架空の段A", "架空の段B", "架空の受け入れ"]

    expect(delegatedWorkPlan(planned(named, 0), signal(1, 2))).toEqual({
      phases: named,
      current: 2,
      phaseSummary: "",
    })
  })

  it("最後の段の合図では受け入れが今の段になる", () => {
    const plan = delegatedWorkPlan({ kind: "none" }, signal(2, 2))

    expect(plan.phases[plan.current]).toBe("受け入れ")
  })

  it("合図の文を段のまとめにし、2文を超えた分は切り詰める（括弧と inline code の中の句点では割らない）", () => {
    expect(
      delegatedWorkPlan({ kind: "none" }, signal(1, 2, "架空の形が分かった。")).phaseSummary,
    ).toBe("架空の形が分かった。")
    expect(
      delegatedWorkPlan(
        { kind: "none" },
        signal(1, 2, "架空の1文目（中は。を含む）。`a。b` の2文目！架空の3文目。架空の4文目"),
      ).phaseSummary,
    ).toBe("架空の1文目（中は。を含む）。`a。b` の2文目！")
  })
})

describe("delegatedPhaseShiftOf", () => {
  it("今の段の1つ前（合図の n 段目）を終えた段として、段のまとめを出す", () => {
    const plan = delegatedWorkPlan({ kind: "none" }, signal(2, 3, "架空のまとめ。"))

    expect(delegatedPhaseShiftOf(plan)).toEqual({
      finished: { kind: "finished", label: "3/5 実装", summary: "架空のまとめ。" },
    })
  })

  it("段のまとめが空なら何も出さない", () => {
    expect(delegatedPhaseShiftOf(delegatedWorkPlan({ kind: "none" }, signal(2, 3)))).toEqual({
      finished: { kind: "none" },
    })
  })
})

function signal(step: number, stepCount: number, summary = ""): DelegateSignal {
  return { step, stepCount, summary }
}
