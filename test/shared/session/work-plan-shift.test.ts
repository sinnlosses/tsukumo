import { describe, expect, it } from "vitest"

import { phaseShiftOf } from "../../../src/shared/session/work-plan-shift.ts"
import {
  currentPhaseOf,
  type LatestWorkPlan,
  plannedPhasesOf,
} from "../../../src/shared/session/work-plan.ts"
import { GROUPED, next, PHASES, planned } from "../../fixture/work-plan-draft.ts"

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
