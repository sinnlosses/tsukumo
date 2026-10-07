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
 * `work_plan` の呼び出し1つ。`phases` を渡せば `phases`、省けば `from-task`（並びは着手したタスクの段から作る）。
 */
export type WorkPlanCall =
  | { readonly kind: "phases"; readonly plan: WorkPlan }
  | { readonly kind: "from-task"; readonly current: number; readonly phaseSummary: string }

/**
 * 外来の値（ツールの引数・transcript）を `work_plan` の呼び出しとして読む。
 * `phases` があれば {@link parseWorkPlan} と同じ。
 * 無ければ、位置が0以上の整数で段のまとめが {@link MAX_PHASE_SUMMARY_SENTENCES} 文以内のときだけ `from-task`
 * （位置が段の数を超えないか・途中の位置に段のまとめがあるかは、並びを作る {@link taskWorkPlanOf} が見る）。
 */
export function parseWorkPlanCall(value: unknown): WorkPlanCall | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  if (value.phases !== undefined) {
    const plan = parseWorkPlan(value)
    return plan === undefined ? undefined : { kind: "phases", plan }
  }
  const { current } = value
  const phaseSummary = parsePhaseSummary(value.phaseSummary)
  return typeof current === "number" &&
    Number.isInteger(current) &&
    current >= 0 &&
    phaseSummary !== undefined &&
    sentenceCount(phaseSummary) <= MAX_PHASE_SUMMARY_SENTENCES
    ? { kind: "from-task", current, phaseSummary }
    : undefined
}

/** タスクの段から作る並びの頭の段。 */
export const PLANNING_PHASE = "計画"

/** タスクの段から作る並びの最後の段。 */
export const ACCEPTANCE_PHASE = "受け入れ"

/**
 * 着手したタスクの段の名前から「計画」「各段」「受け入れ」の並びを作り、呼び出しの位置と段のまとめを合わせた段取り。
 * {@link parseWorkPlan} を通らなければ undefined。
 */
export function taskWorkPlanOf(
  steps: readonly string[],
  call: Extract<WorkPlanCall, { readonly kind: "from-task" }>,
): WorkPlan | undefined {
  return parseWorkPlan({
    phases: [PLANNING_PHASE, ...steps, ACCEPTANCE_PHASE],
    current: call.current,
    phaseSummary: call.phaseSummary,
  })
}

/**
 * サーバが `work_plan` を判定したあとの、いまの段取りの立ち位置（`WorkPlanReview.standing`）。
 * `rejected` はこのターンで差し戻した呼び出しに、まだ受け付けた呼び出しで応えていない。
 * `planned` は同じ依頼で受け付けた段取りがあり、`remaining` はまだ済んでいない段の数（全部済みなら 0）。
 */
export type WorkPlanStanding =
  | { readonly kind: "none" }
  | { readonly kind: "rejected" }
  | { readonly kind: "planned"; readonly remaining: number }

/** 段取りを判定しない口（疑似セッション）が渡す立ち位置。 */
export const NO_WORK_PLAN_STANDING = { kind: "none" } as const satisfies WorkPlanStanding

/** 委譲の返却1回で段取りがどうなるか。`held` は段を動かさない。 */
export type ReturnAdvance =
  | { readonly kind: "held" }
  | { readonly kind: "advanced"; readonly plan: WorkPlan }

/** 委譲の返却1回が言う位置。`finishedPhase` は済んだ段の番号（計画だけなら 0）、`phaseCount` は委譲先の段の数。 */
export type DelegateReturnPosition = {
  readonly finishedPhase: number
  readonly phaseCount: number
  readonly summary: string
}

/**
 * 委譲の返却1回で位置を決めた段取り（{@link ReturnAdvance}）。
 * 段の並びは「計画」「委譲先の各段」「受け入れ」なので、今の段は `finishedPhase + 1` になる。
 * 返却のまとめは {@link MAX_PHASE_SUMMARY_SENTENCES} 文で切り詰めて済んだ段のまとめにする。
 * 委譲先の段の数が帯と合わない・求めた位置が今の位置以下・受け入れより先なら動かさない。
 * 計画の返却（`finishedPhase` 0）だけは段の数を照合しない（委譲先が `## やること` を書き直した返却で、帯はまだ書き直す前の並び）。
 */
export function advancedByReturn(plan: WorkPlan, returned: DelegateReturnPosition): ReturnAdvance {
  const target = returned.finishedPhase + 1
  return (returned.finishedPhase === 0 || returned.phaseCount + 2 === plan.phases.length) &&
    target > plan.current &&
    target < plan.phases.length
    ? {
        kind: "advanced",
        plan: {
          phases: plan.phases,
          current: target,
          phaseSummary: leadingSentences(returned.summary, MAX_PHASE_SUMMARY_SENTENCES),
        },
      }
    : { kind: "held" }
}

/** `report` の欄 `workPlanClosing` で渡せる段の閉じ方。`finished` は全部の段を終えた、`stopped` は途中で止めた。 */
export const WORK_PLAN_CLOSINGS = ["finished", "stopped"] as const

/** `report` が渡した段の閉じ方。欄の無い `report` と、欄を持たなかったころの記録は `none`。 */
export type WorkPlanClosing = "none" | (typeof WORK_PLAN_CLOSINGS)[number]

/** `report` の引数の `workPlanClosing` を読む。「無い」と形の崩れは `none` に畳む。 */
export function parseWorkPlanClosing(value: unknown): WorkPlanClosing {
  return WORK_PLAN_CLOSINGS.find((closing) => closing === value) ?? "none"
}

/** `finished` の `report` 1回で段取りがどうなるか。`held` は段を動かさない。 */
export type ReportClose =
  | { readonly kind: "held" }
  | { readonly kind: "closed"; readonly plan: WorkPlan }

/**
 * `finished` の `report` 1回で閉じた段取り（{@link ReportClose}）。
 * 最後の段にいるときだけ、段の並びはそのままで全部の段を終えた位置にする（最後の段のまとめは最終レポートが担うので持たない）。
 * 段が2つ以上残っている・全部の段を終えた位置からは動かさない。
 */
export function closedByReport(plan: WorkPlan): ReportClose {
  return plan.current + 1 === plan.phases.length
    ? {
        kind: "closed",
        plan: { phases: plan.phases, current: plan.phases.length, phaseSummary: "" },
      }
    : { kind: "held" }
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
