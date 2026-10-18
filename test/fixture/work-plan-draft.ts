// 段の名前とまとめはすべて架空のもの。

import type { LatestWorkPlan, WorkPlan, WorkPlanEntry } from "../../src/shared/session/work-plan.ts"

export const PHASES = ["架空の段A", "架空の段B", "架空の段C"]

export const GROUPED: readonly WorkPlanEntry[] = [
  "架空の段A",
  ["架空の段B", "架空の段C"],
  "架空の段D",
]

export function planned(
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

export function next(
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
