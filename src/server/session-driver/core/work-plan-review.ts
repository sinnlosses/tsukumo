// `work_plan` の差し戻し（形の崩れと段の一足飛び）と、いまの段取りの立ち位置。
// 一足飛びは、同じ依頼の中で同じ段の並びのまま `current` を2つ以上進めた呼び出し。
// 飛ばした段には段のまとめが無く、メインビューの中間レポートがその段だけ抜けるため。
//
// 判定の窓口は handler だけ（`WorkPlanReview.judge`）。
// 覚えるのは、同じ依頼の中で最後に受け付けた段取りだけで、依頼（`request` / `turn-started`）で忘れる。
// 委譲の返却（`delegate-returned`）は、覚えた段取りを状態の畳み込みと同じ決まり（`advancedByReturn`）で1段進める。
// メインの呼び出しはそこから +1 までしか通らない。
//
// 差し戻したあと同じターンで受け付けた呼び出しが無いことも覚え、`report` の差し戻し（`ReportReview`）が `standing` で読む。
// ターンの区切りは `session-info`（ターンの頭に毎回届く）と `turn-finished`。
//
// `WorkPlanReview.pass` が `work-plan-called` を同じ呼び出しの `tool-finished` まで預かり、`isError`（差し戻したら true）に従って描くか捨てるかを決める。
// transcript から組み直すときも結果は残っているので、`pass` だけを通せば同じ並びになる。

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  advancedByReturn,
  parseWorkPlan,
  type WorkPlan,
  type WorkPlanStanding,
} from "../../../shared/session/work-plan.ts"

export type WorkPlanVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "malformed" }
  | { readonly kind: "skipped-phase" }

export type WorkPlanReview = {
  /** `work_plan` の handler から、届いた引数のままで呼ぶ。 */
  readonly judge: (input: unknown) => WorkPlanVerdict
  /** いまの段取りの立ち位置（{@link WorkPlanStanding}）。 */
  readonly standing: () => WorkPlanStanding
  /**
   * 届いたイベントを流してよい並びに変える。
   * `work-plan-called` は同じ `toolUseId` の `tool-finished` まで預かり、`isError` でなければその直前に `work-plan` として出す。
   * 預かったままターンが終わった呼び出し（結果の届かなかった呼び出し）は、`turn-finished` の直前に出す。
   * 委譲の返却はサブエージェントのメッセージから出るので、メインとサブエージェントの両方のイベントを渡す。
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
    accepted = plan
    return { kind: "accepted" }
  }

  return {
    judge: (input) => {
      const plan = parseWorkPlan(input)
      const verdict: WorkPlanVerdict =
        plan === undefined ? { kind: "malformed" } : judgeWellFormed(plan)
      unansweredRejection = verdict.kind !== "accepted"
      return verdict
    },
    standing: () => {
      if (unansweredRejection) {
        return { kind: "rejected" }
      }
      return accepted === undefined
        ? { kind: "none" }
        : { kind: "planned", remaining: accepted.phases.length - accepted.current }
    },
    pass: (event) => {
      switch (event.kind) {
        case "work-plan-called":
          held = [...held, event]
          return []
        case "tool-finished": {
          const call = held.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (call === undefined) {
            return [event]
          }
          held = held.filter((candidate) => candidate !== call)
          return event.isError ? [event] : [call.plan, event]
        }
        case "delegate-returned": {
          const advance =
            accepted === undefined ? undefined : advancedByReturn(accepted, event.summary)
          if (advance?.kind === "advanced") {
            accepted = advance.plan
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
          const unsettled = held.map((call) => call.plan)
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
  return (
    next.current > previous.current + 1 &&
    next.phases.length === previous.phases.length &&
    next.phases.every((phase, index) => phase === previous.phases[index])
  )
}
