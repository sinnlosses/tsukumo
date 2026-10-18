// `work_plan` の呼び出し1つで済んだ段と、そのまとめ（メインビューの中間レポート）を導く決まり。

import { isBlankText } from "../utils/blank-text.ts"
import { phaseLabel } from "./work-plan-phase-number.ts"
import {
  currentPhaseOf,
  type LatestWorkPlan,
  phaseCount,
  type PlannedPhase,
  plannedPhasesOf,
  type WorkPlan,
} from "./work-plan.ts"

/**
 * `work_plan` の呼び出し1つで段が移ったか。
 * `finished` は終えた段（見出しの字）とそのまとめで、中間レポートになる。
 */
export type PhaseShift = {
  readonly finished:
    | { readonly kind: "none" }
    | {
        readonly kind: "finished"
        readonly label: string
        readonly summary: string
        readonly skipped: boolean
      }
}

/**
 * 同じ依頼の中の前のワークプラン `previous` から `next` へ移ったときに、メインビューに出すもの（{@link PhaseShift}）。
 *
 * - 依頼で最初のワークプランと、全部の段を終えたワークプランでは何も出さない（最後の段のまとめは最終レポートが担う）
 * - 中間レポートは、前の今の段のどれかが新しい並びで済んだ段になったときだけ出す。
 *   段は名前と同じ名前の段の中で何番目かで探すので、段を進めながら後ろの段を組み替えても終えた段を見失わず、
 *   同じ名前の済んだ段を今の段と取り違えない。
 *   戻った・組み替えただけで前の今の段が済んでいない（今の段以降にある・並びから消えた）ときは出さない
 * - そのほか、前のワークプランのまとめ待ちの段が新しい並びで済んでいれば、新しいまとめをその段の中間レポートにする
 */
export function phaseShiftOf(previous: LatestWorkPlan, next: WorkPlan): PhaseShift {
  const shifted = shiftedPhaseOf(previous, next)
  if (shifted.kind === "none") {
    return NO_PHASE_SHIFT
  }
  return {
    finished: {
      kind: "finished",
      label: phaseLabel({
        kind: "phase",
        indexes: [shifted.phase.index],
        count: phaseCount(next.phases),
        name: shifted.phase.name,
        range: next.delegatedRange,
      }),
      summary: shifted.summary,
      skipped: shifted.phase.skipped,
    },
  }
}

/**
 * `previous` から `next` へ移ったときに済んだ段（`next` の並びの段）とそのまとめ。
 * 出す・出さないの条件は {@link phaseShiftOf} と同じで、出さないときは `none`。
 */
export function shiftedPhaseOf(
  previous: LatestWorkPlan,
  next: WorkPlan,
):
  | { readonly kind: "none" }
  | { readonly kind: "finished"; readonly phase: PlannedPhase; readonly summary: string } {
  if (previous.kind === "none" || currentPhaseOf({ kind: "planned", ...next }).kind === "none") {
    return NO_SHIFTED_PHASE
  }
  const nextPhases = plannedPhasesOf(next)
  const finishedNow = plannedPhasesOf(previous)
    .filter((phase) => phase.state === "current")
    .map((phase) => nextPhases.find((candidate) => candidate.key === phase.key))
    .find((found) => found?.state === "done")
  const { awaitingSummary } = previous
  const finished =
    finishedNow ??
    (awaitingSummary.kind === "awaiting"
      ? nextPhases.find(
          (candidate) => candidate.key === awaitingSummary.key && candidate.state === "done",
        )
      : undefined)
  if (finished === undefined || isBlankText(next.phaseSummary)) {
    return NO_SHIFTED_PHASE
  }
  return { kind: "finished", phase: finished, summary: next.phaseSummary }
}

const NO_PHASE_SHIFT = {
  finished: { kind: "none" },
} as const satisfies PhaseShift

const NO_SHIFTED_PHASE = { kind: "none" } as const
