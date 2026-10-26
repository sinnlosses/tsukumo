// `work_plan` の差し戻し（形の崩れ・段の一足飛び）と、いまのワークプランの立ち位置。
// `phase_result` の `count` を受けたあとの `work_plan` は、委譲先の段の範囲の段の数をその `count` で確定する。
// 一足飛びは、同じ依頼の中で同じ段の並びのまま、済んだ段（並びを平らにして数える）を1回で2つ以上増やした呼び出し。
// 一足飛びで越えた段には段のまとめが無く、メインビューの中間レポートがその段だけ抜けるため。
// 飛ばした段（`skippedPhases`）は、前に印なしに済んでいた段を新しく入れる呼び出しと、メインが入れた印をまだ済んでいる段から外す呼び出しも差し戻す。
//
// 判定の窓口は handler だけ（`WorkPlanReview.judge`・`WorkPlanReview.judgeResult`）。
// 委譲先の返却（`delegate-handed-back`）は本文を読まず、委譲ゲートと注記（`phase-result-called` を受けた委譲先かどうかで文が変わる）だけを立て、イベントは捨てる。
// 覚えるワークプランは `nextWorkPlan` で畳んだ結果だけで、忘れる区切りも返却と `report` での進め方もここでは決めない。
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
import { nextWorkPlan, phaseFinishedByReturn } from "../../../shared/session/work-plan-fold.ts"
import {
  type DelegatedRange,
  finishedPhaseCount,
  isMidWay,
  type LatestWorkPlan,
  NO_DELEGATED_RANGE,
  parseWorkPlanCall,
  phaseCount,
  finishedPhaseNames,
  type WorkPlan,
  type WorkPlanStanding,
  settleDelegatedRange,
  type WorkPlanCall,
} from "../../../shared/session/work-plan.ts"
import {
  bandPositionText,
  delegatedRangeFromAnswer,
  handbackNoteText,
  PHASE_RESULT_MISSING_HANDBACK_LINE,
  RESULT_CALLED_HANDBACK_LINE,
} from "./band-position.ts"

export type WorkPlanVerdict =
  | { readonly kind: "accepted"; readonly plan: WorkPlan }
  | { readonly kind: "malformed" }
  | { readonly kind: "summary-missing" }
  | { readonly kind: "skipped-phase" }
  | { readonly kind: "closed-by-plan" }
  | { readonly kind: "skip-mark-late" }
  | { readonly kind: "skip-mark-dropped" }

/**
 * `phase_result` の判定。`accepted` の `moved` は帯を動かしたか、`handback` は結果を返却の形にしたもの、`plan` は判定のあとのワークプラン。
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
   * `phase_result` の handler から、届いた引数のままで呼ぶ。受け付けたら、帯の段を済ませる条件を満たすときだけワークプランを進める。
   * 委譲ゲートと注記は触らない。`skipped` で済ませた段の名前は、同じ依頼のあいだ飛ばした段として覚える。
   */
  readonly judgeResult: (input: unknown) => PhaseResultVerdict
  /** いまのワークプランの立ち位置（{@link WorkPlanStanding}）。 */
  readonly standing: () => WorkPlanStanding
  /** 返却が届いてから、メインの `work_plan` が受け付けられるまでのあいだ真。 */
  readonly gateRaised: () => boolean
  /** 受け付け済みのワークプランが無いあいだ真。差し戻されただけでは真のまま、`request` で真に戻る。 */
  readonly planMissing: () => boolean
  /** 受け付け済みのワークプランの委譲先の段の範囲。ワークプランが無ければ `none`。 */
  readonly delegatedRange: () => DelegatedRange
  /** 受け付け済みのワークプランの帯の位置の文（返却で進めた位置を含む）。ワークプランが無ければ空。 */
  readonly bandPosition: () => string
  /**
   * 返却を運ぶメインの入力に添える注記（`handbackNoteText`）を取り出し、溜めた返却を忘れる。
   * 溜めるのはワークプランがあるときの返却だけで、受け付けた `work_plan`・`request`・`turn-started` で捨てる。無ければ空。
   */
  readonly takeHandbackNote: () => string
  /** 返却を溜めていて、注記をまだ取り出していないか。 */
  readonly handbackNotePending: () => boolean
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
  // 同じ依頼で最後に受けた `phase_result` の段の数。
  let returnedCount: number | undefined = undefined
  // 直近の受け付けで `returnedCount` から確定した範囲。`judge` を通らない組み直しでは立たない。
  let confirmedRange: DelegatedRange | undefined = undefined
  let gateRaised = false
  let handbackLines: readonly string[] = []
  // `phase_result` の `skipped` で付いた飛ばした段の名前と、`phase_result` を呼んで次の返却をまだ返していない委譲先。
  let resultMarks: readonly string[] = []
  let resultCallers: ReadonlySet<string> = new Set()

  /** `plan` の飛ばした段に、`phase_result` で付いた印のうち `plan` で済んでいる段を足す。 */
  const withResultMarks = (plan: WorkPlan): WorkPlan => {
    const finished = finishedPhaseNames(plan)
    const kept = resultMarks.filter(
      (name) => finished.has(name) && !plan.skippedPhases.includes(name),
    )
    return kept.length === 0 ? plan : { ...plan, skippedPhases: [...plan.skippedPhases, ...kept] }
  }

  /**
   * 呼び出しの範囲を、受け付けたときに確定した範囲に置き換える。
   * `judge` を通らない組み直しでは、返した文（{@link delegatedRangeFromAnswer}）から読む。どちらも無ければそのまま。
   */
  const withConfirmedRange = (plan: WorkPlan, answer: string): WorkPlan => {
    const range = confirmedRange ?? delegatedRangeFromAnswer(answer)
    return range === undefined ? plan : { ...plan, delegatedRange: range }
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

  const judgeWellFormed = (call: WorkPlanCall): WorkPlanVerdict => {
    if (call.plan.current === call.plan.phases.length) {
      return { kind: "closed-by-plan" }
    }
    const plan = settleDelegatedRange(
      call,
      accepted.kind === "planned" ? accepted.delegatedRange : NO_DELEGATED_RANGE,
      returnedCount,
    )
    if (plan === undefined) {
      return { kind: "malformed" }
    }
    if (isMidWay(plan) && plan.phaseSummary === "") {
      return { kind: "summary-missing" }
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
    confirmedRange = plan.delegatedRange
    accepted = nextWorkPlan(accepted, { kind: "work-plan", ...withResultMarks(plan) })
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
      const call = parseWorkPlanCall(input)
      return settle(call === undefined ? { kind: "malformed" } : judgeWellFormed(call))
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
      accepted = nextWorkPlan(accepted, { kind: "delegate-returned", handback })
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
    planMissing: () => accepted.kind === "none",
    delegatedRange: () =>
      accepted.kind === "planned" ? accepted.delegatedRange : NO_DELEGATED_RANGE,
    bandPosition: () => bandPositionText(accepted),
    takeHandbackNote: () => {
      const note = handbackNoteText(handbackLines, accepted)
      handbackLines = []
      return note
    },
    handbackNotePending: () => handbackLines.length > 0,
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
            : [
                {
                  kind: "work-plan",
                  ...withConfirmedRange(withResultMarks(called.plan), event.content),
                },
                event,
              ]
        }
        case "report":
          accepted = nextWorkPlan(accepted, event)
          return [event]
        case "phase-result-called":
          resultCallers = new Set([...resultCallers, event.delegate])
          return []
        case "delegate-handed-back": {
          const resultCalled = resultCallers.has(event.delegate)
          resultCallers = new Set([...resultCallers].filter((caller) => caller !== event.delegate))
          if (accepted.kind === "planned") {
            gateRaised = true
            handbackLines = [
              ...handbackLines,
              resultCalled ? RESULT_CALLED_HANDBACK_LINE : PHASE_RESULT_MISSING_HANDBACK_LINE,
            ]
          }
          return []
        }
        case "request":
          accepted = nextWorkPlan(accepted, event)
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

function skipsPhase(previous: WorkPlan, next: WorkPlan): boolean {
  return gainedPhases(previous, next) > 1
}

/** 同じ段の並びのまま、済んだ段が増えた数。並びが変わっていれば 0。 */
function gainedPhases(previous: WorkPlan, next: WorkPlan): number {
  return isDeepEqual(previous.phases, next.phases)
    ? finishedPhaseCount(next) - finishedPhaseCount(previous)
    : 0
}
