import { describe, expect, it } from "vitest"

import { doneMarkOf, phaseMarkOf } from "../../../src/browser/domain/phase-mark.ts"
import { plannedPhasesOf, type PlannedWorkPlan } from "../../../src/shared/session/work-plan.ts"
import { GROUPED, next, PHASES } from "../../fixture/work-plan-draft.ts"

describe("doneMarkOf", () => {
  it("済んだ段は「✓」、飛ばした段は「/」", () => {
    expect(doneMarkOf(false)).toBe("✓")
    expect(doneMarkOf(true)).toBe("/")
  })
})

describe("phaseMarkOf", () => {
  it("済んだ段は「✓」、飛ばした段は「/」、ほかは序数", () => {
    const plan: PlannedWorkPlan = {
      kind: "planned",
      ...next(PHASES, 1),
      skippedPhases: ["架空の段A"],
    }
    expect(plannedPhasesOf(plan).map((phase) => phaseMarkOf(plan, phase))).toEqual(["/", "2", "3"])
  })

  it("番号を持つ段は今の段も後ろの段も序数で数える", () => {
    const plan: PlannedWorkPlan = { kind: "planned", ...next(PHASES, 0) }
    expect(plannedPhasesOf(plan).map((phase) => phaseMarkOf(plan, phase))).toEqual(["1", "2", "3"])
  })

  it("範囲の先頭から後ろの段（番号を持たない段）は「…」", () => {
    const plan: PlannedWorkPlan = {
      kind: "planned",
      ...next(GROUPED, 1),
      delegatedRange: { kind: "pending", first: 1 },
    }
    expect(plannedPhasesOf(plan).map((phase) => phaseMarkOf(plan, phase))).toEqual([
      "✓",
      "…",
      "…",
      "…",
    ])
  })

  it("計画が無ければ、まだの段は「…」", () => {
    const phase = { index: 0, state: "upcoming", skipped: false } as const
    expect(phaseMarkOf({ kind: "none" }, phase)).toBe("…")
  })
})
