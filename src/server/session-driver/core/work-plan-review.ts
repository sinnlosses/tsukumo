// `work_plan` の差し戻し（形の崩れ・段の一足飛び・委譲先の段の範囲と返却の `N` の食い違い・返却を受けたのに範囲が無い）と、いまの段取りの立ち位置。
// 返却で進んだ位置のままメインが同じ位置を渡す呼び出しは、段のまとめが無くても通す。
// 一足飛びは、同じ依頼の中で同じ段の並びのまま、済んだ段（並びを平らにして数える）を1回で2つ以上増やした呼び出し。
// 一足飛びで越えた段には段のまとめが無く、メインビューの中間レポートがその段だけ抜けるため。
// 飛ばした段（`skippedPhases`）は、前に印なしに済んでいた段を新しく入れる呼び出しと、メインが入れた印をまだ済んでいる段から外す呼び出しも差し戻す。
//
// 判定の窓口は handler だけ（`WorkPlanReview.judge`・`WorkPlanReview.judgeResult`）。
// `phase-result-called` を受けた委譲先の次の返却は、1行目を読まずに関門と注記だけを立て、イベントは捨てる。
// 覚える段取りは `nextWorkPlan` で畳んだ結果だけで、忘れる区切りも返却と `report` での進め方もここでは決めない。
//
// 差し戻したあと同じターンで受け付けた呼び出しが無いことも覚え、`report` の差し戻し（`ReportReview`）が `standing` で読む。
// ターンの区切りは `session-info`（ターンの頭に毎回届く）と `turn-finished`。
//
// `WorkPlanReview.pass` が `work-plan-called` を同じ呼び出しの `tool-finished` まで預かり、`isError`（差し戻したら true）に従って描くか捨てるかを決める。
// transcript から組み直すときも結果は残っているので、`pass` だけを通せば同じ並びになる。

import { isDeepEqual } from "remeda"

import type { DelegateReturn } from "../../../shared/session/delegate-return.ts"
import { delegateReturnOf, parsePhaseResult } from "../../../shared/session/phase-result.ts"
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
  finishedPhaseNames,
  phaseFinishedByReturn,
  type WorkPlan,
  type WorkPlanStanding,
} from "../../../shared/session/work-plan.ts"
import {
  bandPositionText,
  handbackLineText,
  handbackNoteText,
  RESULT_CALLED_HANDBACK_LINE,
} from "./band-position.ts"
import { judgePhaseMention } from "./phase-mention.ts"

export type WorkPlanVerdict =
  | { readonly kind: "accepted"; readonly plan: WorkPlan }
  | { readonly kind: "malformed" }
  | { readonly kind: "skipped-phase" }
  | { readonly kind: "range-mismatch" }
  | { readonly kind: "range-missing" }
  | { readonly kind: "phase-number" }
  | { readonly kind: "closed-by-plan" }
  | { readonly kind: "skip-mark-late" }
  | { readonly kind: "skip-mark-dropped" }

/**
 * `phase_result` の判定。`accepted` の `moved` は帯を動かしたか、`handback` は結果を返却の形にしたもの、`plan` は判定のあとの段取り。
 * 帯を動かさない呼び出しも差し戻さない。
 */
export type PhaseResultVerdict =
  | {
      readonly kind: "accepted"
      readonly moved: boolean
      readonly handback: DelegateReturn
      readonly plan: LatestWorkPlan
    }
  | { readonly kind: "malformed" }

export type WorkPlanReview = {
  /** `work_plan` の handler から、届いた引数のままで呼ぶ。 */
  readonly judge: (input: unknown) => WorkPlanVerdict
  /**
   * `phase_result` の handler から、届いた引数のままで呼ぶ。受け付けたら `段 n/N` と同じ条件で段取りを進める。
   * 関門と注記は触らず、段のまとめを省ける位置にもしない。`skipped` で済ませた段の名前は、同じ依頼のあいだ飛ばした段として覚える。
   */
  readonly judgeResult: (input: unknown) => PhaseResultVerdict
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
  // `phase_result` の `skipped` で付いた飛ばした段の名前と、`phase_result` を呼んで次の返却をまだ返していない委譲先。
  let resultMarks: readonly string[] = []
  let resultCallers: ReadonlySet<string> = new Set()

  const isReturnedPosition = (plan: WorkPlan): boolean =>
    positionFromReturn && accepted.kind === "planned" && isSamePosition(accepted, plan)

  /** `plan` の飛ばした段に、`phase_result` で付いた印のうち `plan` で済んでいる段を足す。 */
  const withResultMarks = (plan: WorkPlan): WorkPlan => {
    const finished = finishedPhaseNames(plan)
    const kept = resultMarks.filter(
      (name) => finished.has(name) && !plan.skippedPhases.includes(name),
    )
    return kept.length === 0 ? plan : { ...plan, skippedPhases: [...plan.skippedPhases, ...kept] }
  }

  const judgeSkipMarks = (plan: WorkPlan): WorkPlanVerdict | undefined => {
    if (accepted.kind !== "planned") {
      return undefined
    }
    const previous = accepted
    const finishedBefore = finishedPhaseNames(previous)
    const finishedNow = finishedPhaseNames(plan)
    if (
      plan.skippedPhases.some(
        (name) => finishedBefore.has(name) && !previous.skippedPhases.includes(name),
      )
    ) {
      return { kind: "skip-mark-late" }
    }
    const mainMarks = previous.skippedPhases.filter((name) => !resultMarks.includes(name))
    if (mainMarks.some((name) => finishedNow.has(name) && !plan.skippedPhases.includes(name))) {
      return { kind: "skip-mark-dropped" }
    }
    return undefined
  }

  const judgeWellFormed = (plan: WorkPlan): WorkPlanVerdict => {
    if (plan.current === plan.phases.length) {
      return { kind: "closed-by-plan" }
    }
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
    const skipMarkVerdict = judgeSkipMarks(plan)
    if (skipMarkVerdict !== undefined) {
      return skipMarkVerdict
    }
    const finishedNow = finishedPhaseNames(plan)
    resultMarks = resultMarks.filter((name) => finishedNow.has(name))
    accepted = nextWorkPlan(accepted, { kind: "work-plan", ...withResultMarks(plan) })
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
    judgeResult: (input) => {
      const result = parsePhaseResult(input)
      if (result === undefined) {
        return { kind: "malformed" }
      }
      const handback = delegateReturnOf(result)
      returnedCount = result.count
      const returned =
        accepted.kind === "planned" ? phaseFinishedByReturn(accepted, handback) : undefined
      if (returned?.kind !== "finished") {
        return { kind: "accepted", moved: false, handback, plan: accepted }
      }
      accepted = nextWorkPlan(accepted, { kind: "delegate-returned", delegate: "", handback })
      positionFromReturn = false
      if (handback.kind === "phase-skipped" && !resultMarks.includes(returned.phase.name)) {
        resultMarks = [...resultMarks, returned.phase.name]
      }
      return { kind: "accepted", moved: true, handback, plan: accepted }
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
          return event.isError
            ? [event]
            : [{ kind: "work-plan", ...withResultMarks(called.plan) }, event]
        }
        case "report":
          accepted = nextWorkPlan(accepted, event)
          return [event]
        case "phase-result-called":
          resultCallers = new Set([...resultCallers, event.delegate])
          return []
        case "delegate-returned": {
          if (resultCallers.has(event.delegate)) {
            resultCallers = new Set(
              [...resultCallers].filter((caller) => caller !== event.delegate),
            )
            gateRaised = gateRaised || accepted.kind === "planned"
            if (accepted.kind === "planned") {
              handbackLines = [...handbackLines, RESULT_CALLED_HANDBACK_LINE]
            }
            return []
          }
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
          resultMarks = []
          resultCallers = new Set()
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

function skipsPhase(previous: WorkPlan, next: WorkPlan): boolean {
  return gainedPhases(previous, next) > 1
}

/** 同じ段の並びのまま、済んだ段が増えた数。並びが変わっていれば 0。 */
function gainedPhases(previous: WorkPlan, next: WorkPlan): number {
  return isDeepEqual(previous.phases, next.phases)
    ? finishedPhaseCount(next) - finishedPhaseCount(previous)
    : 0
}
