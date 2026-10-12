// `work_plan` の差し戻し（形の崩れ・段の一足飛び・委譲先の段の範囲と返却の `N` の食い違い・返却を受けたのに範囲が無い）と、いまの段取りの立ち位置。
// 返却で進んだ位置のままメインが同じ位置を渡す呼び出しは、段のまとめが無くても通す。
// 一足飛びは、同じ依頼の中で同じ段の並びのまま、済んだ段（並びを平らにして数える）を1回で2つ以上増やした呼び出し。
// 飛ばした段には段のまとめが無く、メインビューの中間レポートがその段だけ抜けるため。
//
// 判定の窓口は handler だけ（`WorkPlanReview.judge`）。
// 覚える段取りは `nextWorkPlan` で畳んだ結果だけで、忘れる区切りも返却と `report` での進め方もここでは決めない。
//
// 差し戻したあと同じターンで受け付けた呼び出しが無いことも覚え、`report` の差し戻し（`ReportReview`）が `standing` で読む。
// ターンの区切りは `session-info`（ターンの頭に毎回届く）と `turn-finished`。
//
// `WorkPlanReview.pass` が `work-plan-called` を同じ呼び出しの `tool-finished` まで預かり、`isError`（差し戻したら true）に従って描くか捨てるかを決める。
// transcript から組み直すときも結果は残っているので、`pass` だけを通せば同じ並びになる。

import { isDeepEqual } from "remeda"

import type { DelegateReturn } from "../../../shared/session/delegate-return.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  type DelegatedRange,
  finishedPhaseCount,
  isMidWay,
  type LatestWorkPlan,
  NO_DELEGATED_RANGE,
  nextWorkPlan,
  parseWorkPlan,
  phaseCount,
  type WorkPlan,
  type WorkPlanStanding,
} from "../../../shared/session/work-plan.ts"
import { bandPositionText, handbackLineText, handbackNoteText } from "./band-position.ts"
import { judgePhaseMention } from "./phase-mention.ts"

export type WorkPlanVerdict =
  | { readonly kind: "accepted"; readonly plan: WorkPlan }
  | { readonly kind: "malformed" }
  | { readonly kind: "skipped-phase" }
  | { readonly kind: "empty-summary" }
  | { readonly kind: "range-mismatch" }
  | { readonly kind: "range-missing" }
  | { readonly kind: "phase-number" }

export type WorkPlanReview = {
  /** `work_plan` の handler から、届いた引数のままで呼ぶ。 */
  readonly judge: (input: unknown) => WorkPlanVerdict
  /** いまの段取りの立ち位置（{@link WorkPlanStanding}）。 */
  readonly standing: () => WorkPlanStanding
  /** 返却が届いてから、メインの `work_plan` が受け付けられるまでのあいだ真。 */
  readonly gateRaised: () => boolean
  /** 受け付け済みの段取りの委譲先の段の範囲。段取りが無ければ `none`。 */
  readonly delegatedRange: () => DelegatedRange
  /** 受け付け済みの段取りの帯の位置の文（返却で進めた位置を含む）。段取りが無ければ空。 */
  readonly bandPosition: () => string
  /**
   * 返却を運ぶメインの入力に添える注記（`handbackNoteText`）を取り出し、溜めた返却を忘れる。
   * 溜めるのは段取りがあるときの返却だけで、受け付けた `work_plan`・`request`・`turn-started` で捨てる。無ければ空。
   */
  readonly takeHandbackNote: () => string
  /**
   * 届いたイベントを流してよい並びに変える。
   * `work-plan-called` は同じ `toolUseId` の `tool-finished` まで預かり、`isError` でなければその直前に `work-plan` として出す。
   * 預かったままターンが終わった呼び出し（結果の届かなかった呼び出し）は、`turn-finished` の直前に出す。
   */
  readonly pass: (event: SessionEvent) => readonly SessionEvent[]
}

type WorkPlanCalled = Extract<SessionEvent, { readonly kind: "work-plan-called" }>

/** {@link WorkPlanReview} を1つ作る。セッション1つに1つ。 */
export function createWorkPlanReview(): WorkPlanReview {
  let accepted: LatestWorkPlan = { kind: "none" }
  let unansweredRejection = false
  let held: readonly WorkPlanCalled[] = []
  // 返却で進めた位置のままか（メインの受け付けた呼び出しが無いあいだ）と、同じ依頼で最後に受けた返却の段の数。
  let positionFromReturn = false
  let returnedCount: number | undefined = undefined
  let gateRaised = false
  let handbackLines: readonly string[] = []

  const isReturnedPosition = (plan: WorkPlan): boolean =>
    positionFromReturn && accepted.kind === "planned" && isSamePosition(accepted, plan)

  const judgeWellFormed = (plan: WorkPlan): WorkPlanVerdict => {
    if (plan.delegatedRange.kind !== "range" && returnedCount !== undefined) {
      return { kind: "range-missing" }
    }
    if (
      plan.delegatedRange.kind === "range" &&
      returnedCount !== undefined &&
      plan.delegatedRange.count !== returnedCount
    ) {
      return { kind: "range-mismatch" }
    }
    if (judgePhaseMention(plan.delegatedRange, [plan.phaseSummary]).kind === "rejected") {
      return { kind: "phase-number" }
    }
    if (isMidWay(plan) && plan.phaseSummary === "" && !isReturnedPosition(plan)) {
      return { kind: "malformed" }
    }
    if (accepted.kind === "planned" && skipsPhase(accepted, plan)) {
      return { kind: "skipped-phase" }
    }
    if (accepted.kind === "planned" && advancesWithoutSummary(accepted, plan)) {
      return { kind: "empty-summary" }
    }
    accepted = nextWorkPlan(accepted, { kind: "work-plan", ...plan })
    positionFromReturn = false
    gateRaised = false
    handbackLines = []
    return { kind: "accepted", plan }
  }

  const settle = (verdict: WorkPlanVerdict): WorkPlanVerdict => {
    unansweredRejection = verdict.kind !== "accepted"
    return verdict
  }

  return {
    judge: (input) => {
      const plan = parseWorkPlan(input)
      return settle(plan === undefined ? { kind: "malformed" } : judgeWellFormed(plan))
    },
    standing: () => {
      if (unansweredRejection) {
        return { kind: "rejected" }
      }
      return accepted.kind === "none"
        ? { kind: "none" }
        : {
            kind: "planned",
            remaining: phaseCount(accepted.phases) - finishedPhaseCount(accepted),
          }
    },
    gateRaised: () => gateRaised,
    delegatedRange: () =>
      accepted.kind === "planned" ? accepted.delegatedRange : NO_DELEGATED_RANGE,
    bandPosition: () => bandPositionText(accepted),
    takeHandbackNote: () => {
      const note = handbackNoteText(handbackLines, accepted)
      handbackLines = []
      return note
    },
    pass: (event) => {
      switch (event.kind) {
        case "work-plan-called":
          held = [...held, event]
          return []
        case "tool-finished": {
          const called = held.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (called === undefined) {
            return [event]
          }
          held = held.filter((candidate) => candidate !== called)
          return event.isError ? [event] : [{ kind: "work-plan", ...called.plan }, event]
        }
        case "report":
          accepted = nextWorkPlan(accepted, event)
          return [event]
        case "delegate-returned": {
          returnedCount = returnedCountOf(event.handback) ?? returnedCount
          gateRaised = gateRaised || accepted.kind === "planned"
          if (accepted.kind === "planned") {
            handbackLines = [...handbackLines, handbackLineText(accepted, event.handback)]
          }
          const next = nextWorkPlan(accepted, event)
          positionFromReturn = positionFromReturn || !isDeepEqual(next, accepted)
          accepted = next
          return [event]
        }
        case "request":
          accepted = nextWorkPlan(accepted, event)
          positionFromReturn = false
          returnedCount = undefined
          gateRaised = false
          handbackLines = []
          unansweredRejection = false
          return [event]
        case "turn-started":
          returnedCount = undefined
          gateRaised = false
          handbackLines = []
          unansweredRejection = false
          return [event]
        case "session-info":
          unansweredRejection = false
          return [event]
        case "turn-finished": {
          unansweredRejection = false
          const unsettled = held.map(({ plan }): SessionEvent => ({ kind: "work-plan", ...plan }))
          held = []
          return [...unsettled, event]
        }
        default:
          return [event]
      }
    },
  }
}

/** 返却の `N`。形の読めない返却は持たない。 */
function returnedCountOf(handback: DelegateReturn): number | undefined {
  return handback.kind === "unreadable" ? undefined : handback.count
}

/** 段の並びと位置が同じか。段のまとめと範囲は見ない。 */
function isSamePosition(previous: WorkPlan, next: WorkPlan): boolean {
  return (
    isDeepEqual(previous.phases, next.phases) &&
    previous.current === next.current &&
    isDeepEqual(previous.finishedInGroup, next.finishedInGroup)
  )
}

function advancesWithoutSummary(previous: WorkPlan, next: WorkPlan): boolean {
  return gainedPhases(previous, next) > 0 && next.phaseSummary === ""
}

function skipsPhase(previous: WorkPlan, next: WorkPlan): boolean {
  return gainedPhases(previous, next) > 1
}

/** 同じ段の並びのまま、済んだ段が増えた数。並びが変わっていれば 0。 */
function gainedPhases(previous: WorkPlan, next: WorkPlan): number {
  return isDeepEqual(previous.phases, next.phases)
    ? finishedPhaseCount(next) - finishedPhaseCount(previous)
    : 0
}
