import { describe, expect, it } from "vitest"

import { nextWorkPlan } from "../../../src/shared/session/work-plan-fold.ts"
import { nextPhaseLaps } from "../../../src/shared/session/work-plan-lap.ts"
import { plannedPhasesOf } from "../../../src/shared/session/work-plan.ts"
import { next, PHASES, planned } from "../../fixture/work-plan-draft.ts"

describe("nextPhaseLaps", () => {
  it("前のワークプランが無ければ全部 1", () => {
    expect(nextPhaseLaps({ kind: "none" }, next(PHASES, 0))).toEqual([1, 1, 1])
  })

  it("戻していなければ周は進まない（先へ進めても同じ）", () => {
    expect(nextPhaseLaps(planned(PHASES, 0), next(PHASES, 1))).toEqual([1, 1, 1])
    expect(nextPhaseLaps(planned(PHASES, 1), next(PHASES, 1))).toEqual([1, 1, 1])
  })

  it("済んだ段へ戻すと、戻した先の段の周だけが 1 進む", () => {
    expect(nextPhaseLaps(planned(PHASES, 2), next(PHASES, 1))).toEqual([1, 2, 1])
  })

  it("周は名前で引き継ぐ。並びが変わっても、戻した周は残る", () => {
    const first = nextWorkPlan(planned(PHASES, 2), {
      kind: "work-plan",
      ...next(PHASES, 1),
    })
    const reordered = ["架空の新しい段", ...PHASES]
    const after = nextWorkPlan(first, { kind: "work-plan", ...next(reordered, 2) })

    expect(after.kind === "planned" ? after.phaseLaps : undefined).toEqual([1, 1, 2, 1])
  })
})

describe("nextWorkPlan の phase-redone", () => {
  const ranged = (current: number) => ({
    ...planned(PHASES, current),
    delegatedRange: { kind: "range", first: 0, count: 3 } as const,
  })

  it("位置を動かさず、その段の周だけを進め、PlannedPhase.lap に出る", () => {
    const plan = nextWorkPlan(ranged(1), {
      kind: "delegate-returned",
      handback: { kind: "phase-redone", phase: 2, count: 3, summary: "架空の差し戻し" },
    })

    expect(plan.kind === "planned" ? plan.current : undefined).toBe(1)
    expect(plan.kind === "planned" ? plannedPhasesOf(plan).map((phase) => phase.lap) : []).toEqual([
      1, 2, 1,
    ])
  })

  it("範囲の外の redo は何も変えない", () => {
    const before = ranged(1)
    const after = nextWorkPlan(before, {
      kind: "delegate-returned",
      handback: { kind: "phase-redone", phase: 1, count: 9, summary: "架空の差し戻し" },
    })

    expect(after).toBe(before)
  })
})
