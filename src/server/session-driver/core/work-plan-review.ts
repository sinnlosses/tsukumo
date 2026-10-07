// `work_plan` の差し戻し（形の崩れと段の一足飛び）と、いまの段取りの立ち位置。
// 一足飛びは、同じ依頼の中で同じ段の並びのまま、済んだ段（並びを平らにして数える）を1回で2つ以上増やした呼び出し。
// 飛ばした段には段のまとめが無く、メインビューの中間レポートがその段だけ抜けるため。
//
// 判定の窓口は handler だけ（`WorkPlanReview.judge`）。
// 覚えるのは、同じ依頼の中で最後に受け付けた段取りだけで、依頼（`request` / `turn-started`）で忘れる。
// 段の閉じ方が `finished` の `report`（差し戻されずに流れたもの）は、覚えた段取りを `closedByReport` で閉じる。
//
// 差し戻したあと同じターンで受け付けた呼び出しが無いことも覚え、`report` の差し戻し（`ReportReview`）が `standing` で読む。
// ターンの区切りは `session-info`（ターンの頭に毎回届く）と `turn-finished`。
//
// `WorkPlanReview.pass` が `work-plan-called` を同じ呼び出しの `tool-finished` まで預かり、`isError`（差し戻したら true）に従って描くか捨てるかを決める。
// transcript から組み直すときも結果は残っているので、`pass` だけを通せば同じ並びになる。

import { isDeepEqual } from "remeda"

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  closedByReport,
  finishedPhaseCount,
  parseWorkPlan,
  phaseCount,
  type WorkPlan,
  type WorkPlanStanding,
} from "../../../shared/session/work-plan.ts"

export type WorkPlanVerdict =
  | { readonly kind: "accepted"; readonly plan: WorkPlan }
  | { readonly kind: "malformed" }
  | { readonly kind: "skipped-phase" }
  | { readonly kind: "empty-summary" }

export type WorkPlanReview = {
  /** `work_plan` の handler から、届いた引数のままで呼ぶ。 */
  readonly judge: (input: unknown) => WorkPlanVerdict
  /** いまの段取りの立ち位置（{@link WorkPlanStanding}）。 */
  readonly standing: () => WorkPlanStanding
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
  let accepted: WorkPlan | undefined = undefined
  let unansweredRejection = false
  let held: readonly WorkPlanCalled[] = []

  const judgeWellFormed = (plan: WorkPlan): WorkPlanVerdict => {
    if (accepted !== undefined && skipsPhase(accepted, plan)) {
      return { kind: "skipped-phase" }
    }
    if (accepted !== undefined && advancesWithoutSummary(accepted, plan)) {
      return { kind: "empty-summary" }
    }
    accepted = plan
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
      return accepted === undefined
        ? { kind: "none" }
        : {
            kind: "planned",
            remaining: phaseCount(accepted.phases) - finishedPhaseCount(accepted),
          }
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
        case "report": {
          const close =
            accepted === undefined || event.workPlanClosing !== "finished"
              ? undefined
              : closedByReport(accepted)
          if (close?.kind === "closed") {
            accepted = close.plan
          }
          return [event]
        }
        case "request":
        case "turn-started":
          accepted = undefined
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
