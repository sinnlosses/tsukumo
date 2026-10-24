// 段の印。済んだ段は「✓」（飛ばした段は「/」）、ほかの段は段の番号の序数、番号を持たない段は「…」。

import { plannedPhaseNumber } from "../../shared/session/work-plan-phase-number.ts"
import type { LatestWorkPlan, PlannedPhase } from "../../shared/session/work-plan.ts"

export const CHECK_MARK = "✓"
export const SKIPPED_MARK = "/"
export const UNNUMBERED_MARK = "…"

export function doneMarkOf(skipped: boolean): string {
  return skipped ? SKIPPED_MARK : CHECK_MARK
}

export function phaseMarkOf(
  plan: LatestWorkPlan,
  phase: Pick<PlannedPhase, "index" | "state" | "skipped">,
): string {
  if (phase.state === "done") {
    return doneMarkOf(phase.skipped)
  }
  if (plan.kind !== "planned") {
    return UNNUMBERED_MARK
  }
  const number = plannedPhaseNumber(plan, phase)
  return number.kind === "numbered" ? number.ordinals : UNNUMBERED_MARK
}
