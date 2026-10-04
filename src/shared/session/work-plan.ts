// 段取り（`work_plan` ツールで受け取る段の並びと今の位置）の形と、記録から段取りを導く決まり。
// 状態に別の入れ物は持たず、`work-plan` の記録から描くたびに導く。

import { isPlainObject } from "remeda"

import { leadingSentences, sentenceCount } from "../report/sentence-count.ts"
import { isBlankText } from "../utils/blank-text.ts"
import type { SessionRecord } from "./session-state.ts"

/**
 * 段の並びと今の位置。`current` は0始まりで、全部の段が済んだら `phases.length`。
 * `phaseSummary` は終えた段のまとめ（段のまとめ）で、無ければ空の文字列。
 */
export type WorkPlan = {
  readonly phases: readonly string[]
  readonly current: number
  readonly phaseSummary: string
}

/** 段取りが持つ段の数の下限。段が無い段取りは位置を言う意味が無いので受け付けない。 */
export const MIN_WORK_PLAN_PHASES = 1

/** 段のまとめの文の数の上限。 */
export const MAX_PHASE_SUMMARY_SENTENCES = 2

/** 記録の範囲で最後に渡された段取り。1度も渡されていなければ `none`。 */
export type LatestWorkPlan = { readonly kind: "none" } | ({ readonly kind: "planned" } & WorkPlan)

/**
 * 手順1件が始まったときの段。
 * 段取りがまだ無い・全部の段が済んだあとなら `none`。`index` は0始まりで、`count` は段の数。
 */
export type WorkPhase =
  | { readonly kind: "none" }
  | {
      readonly kind: "phase"
      readonly index: number
      readonly count: number
      readonly name: string
    }

/**
 * `work_plan` の呼び出し1つで段が移ったか。
 * `finished` は終えた段（見出しの字）とそのまとめで、中間レポートになる。
 */
export type PhaseShift = {
  readonly finished:
    | { readonly kind: "none" }
    | { readonly kind: "finished"; readonly label: string; readonly summary: string }
}

/**
 * 外来の値（ツールの引数・transcript）を段取りとして読む。
 * 次のどれかなら undefined:
 * 段が {@link MIN_WORK_PLAN_PHASES} 個より少ない・空白だけの名前がある・位置が0から段の数までの整数でない・
 * 位置が途中（0より大きく段の数より小さい）なのに段のまとめが無い・段のまとめが {@link MAX_PHASE_SUMMARY_SENTENCES} 文を超える。
 * ツールの handler が差し戻すかどうかと、変換がイベントにするかどうかは、この1つで決まる。
 */
export function parseWorkPlan(value: unknown): WorkPlan | undefined {
  if (!isPlainObject(value) || !Array.isArray(value.phases)) {
    return undefined
  }
  const phases = value.phases.filter(
    (phase): phase is string => typeof phase === "string" && phase.trim() !== "",
  )
  const { current } = value
  if (
    phases.length !== value.phases.length ||
    phases.length < MIN_WORK_PLAN_PHASES ||
    typeof current !== "number" ||
    !Number.isInteger(current) ||
    current < 0 ||
    current > phases.length
  ) {
    return undefined
  }
  const phaseSummary = parsePhaseSummary(value.phaseSummary)
  if (
    phaseSummary === undefined ||
    (current > 0 && current < phases.length && phaseSummary === "") ||
    sentenceCount(phaseSummary) > MAX_PHASE_SUMMARY_SENTENCES
  ) {
    return undefined
  }
  return { phases, current, phaseSummary }
}

/**
 * 委譲の合図から読んだ段の位置と文。`step` は済んだ段の番号（1始まり）、`stepCount` は段の数。
 * `summary` は合図の3列目で、空なら空の文字列。
 */
export type DelegateSignal = {
  readonly step: number
  readonly stepCount: number
  readonly summary: string
}

/**
 * 委譲の合図から引き直した段取り。段は「計画・合図の N 段・受け入れ」で、今の段は合図の n 段目の次。
 * 段の名前は、`previous` が同じ数（N + 2 段）の段取りならその名前を借り、違えば {@link DELEGATED_PHASE_NAMES} から組む。
 * 段のまとめは合図の文を {@link MAX_PHASE_SUMMARY_SENTENCES} 文で切り詰めたもので、n 段目のまとめになる（{@link delegatedPhaseShiftOf}）。
 */
export function delegatedWorkPlan(previous: LatestWorkPlan, signal: DelegateSignal): WorkPlan {
  const phaseCount = signal.stepCount + 2
  const phases =
    previous.kind === "planned" && previous.phases.length === phaseCount
      ? previous.phases
      : [
          DELEGATED_PHASE_NAMES.plan,
          ...Array.from({ length: signal.stepCount }, () => DELEGATED_PHASE_NAMES.step),
          DELEGATED_PHASE_NAMES.acceptance,
        ]
  return {
    phases,
    current: signal.step + 1,
    phaseSummary: leadingSentences(signal.summary, MAX_PHASE_SUMMARY_SENTENCES),
  }
}

/** 委譲の合図から段取りを組むときの段の名前。 */
const DELEGATED_PHASE_NAMES = {
  plan: "計画",
  step: "実装",
  acceptance: "受け入れ",
} as const satisfies {
  readonly plan: string
  readonly step: string
  readonly acceptance: string
}

/** 記録の範囲で最後の `work-plan` の記録（{@link LatestWorkPlan}）。範囲を依頼1つに絞るのは呼ぶ側。 */
export function latestWorkPlan(records: readonly SessionRecord[]): LatestWorkPlan {
  const found = records.findLast(isWorkPlanRecord)
  return found === undefined ? { kind: "none" } : workPlanOf(found)
}

/** `work-plan` の記録1件が運ぶ段取り。 */
export function workPlanOf(
  record: Extract<SessionRecord, { readonly kind: "work-plan" }>,
): LatestWorkPlan {
  return {
    kind: "planned",
    phases: record.phases,
    current: record.current,
    phaseSummary: record.phaseSummary,
  }
}

export function isWorkPlanRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "work-plan" }> {
  return record.kind === "work-plan"
}

/** 段取りの今の段（{@link WorkPhase}）。 */
export function currentPhaseOf(plan: LatestWorkPlan): WorkPhase {
  if (plan.kind === "none") {
    return { kind: "none" }
  }
  const name = plan.phases[plan.current]
  return name === undefined
    ? { kind: "none" }
    : { kind: "phase", index: plan.current, count: plan.phases.length, name }
}

/**
 * 同じ依頼の中の前の段取り `previous` から `next` へ移ったときに、メインビューに出すもの（{@link PhaseShift}）。
 *
 * - 依頼で最初の段取りと、全部の段を終えた段取りでは何も出さない（最後の段のまとめは最終レポートが担う）
 * - 中間レポートは、前の今の段が新しい並びで今の段より前にあるときだけ出す。
 *   段の名前で探すので、段を進めながら後ろの段を組み替えても終えた段を見失わない。
 *   戻った・組み替えただけで前の今の段が済んでいない（今の段以降にある・並びから消えた）ときは出さない
 */
export function phaseShiftOf(previous: LatestWorkPlan, next: WorkPlan): PhaseShift {
  const nextPhase = currentPhaseOf({ kind: "planned", ...next })
  if (previous.kind === "none" || nextPhase.kind === "none") {
    return NO_PHASE_SHIFT
  }
  const previousPhase = currentPhaseOf(previous)
  const moved =
    previousPhase.kind === "none" ||
    previousPhase.name !== nextPhase.name ||
    previousPhase.index !== nextPhase.index
  if (!moved) {
    return NO_PHASE_SHIFT
  }
  const finishedIndex = previousPhase.kind === "none" ? -1 : next.phases.indexOf(previousPhase.name)
  const finished =
    previousPhase.kind === "phase" &&
    finishedIndex >= 0 &&
    finishedIndex < next.current &&
    !isBlankText(next.phaseSummary)
      ? ({
          kind: "finished",
          label: phaseLabel({
            kind: "phase",
            index: finishedIndex,
            count: next.phases.length,
            name: previousPhase.name,
          }),
          summary: next.phaseSummary,
        } as const)
      : ({ kind: "none" } as const)
  return { finished }
}

/**
 * 委譲の合図から引いた段取り `plan`（{@link delegatedWorkPlan}）1つで、メインビューに出すもの（{@link PhaseShift}）。
 * 前の段取りは見ず、合図1通ごとに、今の段の1つ前（合図の n 段目）を終えた段として出す。
 * 同じ段の合図が続けば、その数だけ出す。段のまとめが空なら何も出さない。
 */
export function delegatedPhaseShiftOf(plan: WorkPlan): PhaseShift {
  const index = plan.current - 1
  const name = plan.phases[index]
  return name === undefined || isBlankText(plan.phaseSummary)
    ? NO_PHASE_SHIFT
    : {
        finished: {
          kind: "finished",
          label: phaseLabel({ kind: "phase", index, count: plan.phases.length, name }),
          summary: plan.phaseSummary,
        },
      }
}

/** 段の見出し「2/4 段の名前」（いまの作業の札・依頼の手順の一覧・メインビューで同じ字）。 */
export function phaseLabel(phase: Extract<WorkPhase, { readonly kind: "phase" }>): string {
  return `${String(phase.index + 1)}/${String(phase.count)} ${phase.name}`
}

const NO_PHASE_SHIFT = {
  finished: { kind: "none" },
} as const satisfies PhaseShift

/** 段のまとめを読む。無い・空白だけなら空の文字列、文字列でなければ undefined。 */
function parsePhaseSummary(value: unknown): string | undefined {
  if (value === undefined) {
    return ""
  }
  if (typeof value !== "string") {
    return undefined
  }
  return isBlankText(value) ? "" : value
}
