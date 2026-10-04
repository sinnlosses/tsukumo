// `work_plan` の段の一足飛びの差し戻し。
// 同じ依頼の中で同じ段の並びのまま `current` を2つ以上進めた呼び出しを差し戻す。
// 飛ばした段には段のまとめが無く、メインビューの中間レポートがその段だけ抜けるため。
//
// 判定の窓口は handler だけ（`WorkPlanReview.judge`）。
// 覚えるのは、同じ依頼の中で最後に受け付けた段取りだけで、依頼（`request` / `turn-started`）と委譲の合図（`delegate-signal`）で忘れる。
// 合図のあとは tsukumo が段を引き直して進めているので、メインの「全部の段を終えた」呼び出しが一足飛びに見えても通す。
//
// `WorkPlanReview.pass` が `work-plan-called` を同じ呼び出しの `tool-finished` まで預かり、`isError`（差し戻したら true）に従って描くか捨てるかを決める。
// transcript から組み直すときも結果は残っているので、`pass` だけを通せば同じ並びになる。

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { WorkPlan } from "../../../shared/session/work-plan.ts"

export type WorkPlanVerdict = { readonly kind: "accepted" } | { readonly kind: "skipped-phase" }

export type WorkPlanReview = {
  /** `work_plan` の handler から、形の検査（`parseWorkPlan`）を通った段取りで呼ぶ。 */
  readonly judge: (plan: WorkPlan) => WorkPlanVerdict
  /**
   * 届いたイベントを流してよい並びに変える。
   * `work-plan-called` は同じ `toolUseId` の `tool-finished` まで預かり、`isError` でなければその直前に `work-plan` として出す。
   * 預かったままターンが終わった呼び出し（結果の届かなかった呼び出し）は、`turn-finished` の直前に出す。
   * 委譲の合図はサブエージェントのメッセージから出るので、メインとサブエージェントの両方のイベントを渡す。
   */
  readonly pass: (event: SessionEvent) => readonly SessionEvent[]
}

type WorkPlanCalled = Extract<SessionEvent, { readonly kind: "work-plan-called" }>

/** {@link WorkPlanReview} を1つ作る。セッション1つに1つ。 */
export function createWorkPlanReview(): WorkPlanReview {
  let accepted: WorkPlan | undefined = undefined
  let held: readonly WorkPlanCalled[] = []

  return {
    judge: (plan) => {
      if (accepted !== undefined && skipsPhase(accepted, plan)) {
        return { kind: "skipped-phase" }
      }
      accepted = plan
      return { kind: "accepted" }
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
        case "request":
        case "turn-started":
        case "delegate-signal":
          accepted = undefined
          return [event]
        case "turn-finished": {
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
