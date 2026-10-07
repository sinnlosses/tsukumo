// `work_plan` の差し戻し（形の崩れと段の一足飛びと、並びを作れない `phases` の省略）と、いまの段取りの立ち位置。
// 一足飛びは、同じ依頼の中で同じ段の並びのまま `current` を2つ以上進めた呼び出し。
// 飛ばした段には段のまとめが無く、メインビューの中間レポートがその段だけ抜けるため。
//
// 判定の窓口は handler だけ（`WorkPlanReview.judge` と `judgeFromTask`）。
// 覚えるのは、同じ依頼の中で最後に受け付けた段取りだけで、依頼（`request` / `turn-started`）で忘れる。
// 委譲の返却（`delegate-returned`）は、覚えた段取りを状態の畳み込みと同じ決まり（`advancedByReturn`）で返却の番号の位置へ進める。
// メインの呼び出しはそこから +1 までしか通らない。
// 段の閉じ方が `finished` の `report`（差し戻されずに流れたもの）は、覚えた段取りを `closedByReport` で閉じる。
//
// 差し戻したあと同じターンで受け付けた呼び出しが無いことも覚え、`report` の差し戻し（`ReportReview`）が `standing` で読む。
// ターンの区切りは `session-info`（ターンの頭に毎回届く）と `turn-finished`。
//
// `WorkPlanReview.pass` が `work-plan-called` を同じ呼び出しの `tool-finished` まで預かり、`isError`（差し戻したら true）に従って描くか捨てるかを決める。
// `phases` を省いた呼び出しの並びは、結果の文（`taskWorkPlanReplyOf`）から読み戻す。
// transcript から組み直すときも結果は残っているので、`pass` だけを通せば同じ並びになる。

import type { ClaimedTaskSteps } from "../../../shared/repository/task-workflow.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  advancedByReturn,
  closedByReport,
  parseWorkPlan,
  taskWorkPlanOf,
  type WorkPlan,
  type WorkPlanCall,
  type WorkPlanStanding,
} from "../../../shared/session/work-plan.ts"
import { phasesOfTaskWorkPlanReply } from "./task-work-plan-reply.ts"

export type WorkPlanVerdict =
  | { readonly kind: "accepted"; readonly plan: WorkPlan }
  | { readonly kind: "malformed" }
  | { readonly kind: "skipped-phase" }
  | { readonly kind: "no-claimed-task" }

export type WorkPlanReview = {
  /** `phases` を渡した `work_plan` の handler から、届いた引数のままで呼ぶ。 */
  readonly judge: (input: unknown) => WorkPlanVerdict
  /**
   * `phases` を省いた `work_plan` の handler から、読んだ着手したタスクの段と合わせて呼ぶ。
   * 段が読めなければ `no-claimed-task`、並びを作れなければ `malformed`。
   */
  readonly judgeFromTask: (
    call: Extract<WorkPlanCall, { readonly kind: "from-task" }>,
    claimed: ClaimedTaskSteps,
  ) => WorkPlanVerdict
  /** いまの段取りの立ち位置（{@link WorkPlanStanding}）。 */
  readonly standing: () => WorkPlanStanding
  /**
   * 届いたイベントを流してよい並びに変える。
   * `work-plan-called` は同じ `toolUseId` の `tool-finished` まで預かり、`isError` でなければその直前に `work-plan` として出す。
   * `phases` を省いた呼び出しは、結果の文から並びを読めたときだけ出す。
   * 預かったままターンが終わった呼び出し（結果の届かなかった呼び出し）は、`phases` を渡したものだけ `turn-finished` の直前に出す。
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
    judgeFromTask: (call, claimed) => {
      if (claimed.kind === "none") {
        return settle({ kind: "no-claimed-task" })
      }
      const plan = taskWorkPlanOf(claimed.steps, call)
      return settle(plan === undefined ? { kind: "malformed" } : judgeWellFormed(plan))
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
          const called = held.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (called === undefined) {
            return [event]
          }
          held = held.filter((candidate) => candidate !== called)
          const plan = event.isError ? undefined : settledPlanOf(called.call, event.content)
          return plan === undefined ? [event] : [{ kind: "work-plan", ...plan }, event]
        }
        case "delegate-returned": {
          const advance = accepted === undefined ? undefined : advancedByReturn(accepted, event)
          if (advance?.kind === "advanced") {
            accepted = advance.plan
          }
          return [event]
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
          const unsettled = held.flatMap(({ call }): readonly SessionEvent[] =>
            call.kind === "phases" ? [{ kind: "work-plan", ...call.plan }] : [],
          )
          held = []
          return [...unsettled, event]
        }
        default:
          return [event]
      }
    },
  }
}

/** 差し戻されなかった呼び出しの段取り。`phases` を省いた呼び出しは結果の文から並びを読む。 */
function settledPlanOf(call: WorkPlanCall, content: string): WorkPlan | undefined {
  if (call.kind === "phases") {
    return call.plan
  }
  const phases = phasesOfTaskWorkPlanReply(content)
  return phases === undefined
    ? undefined
    : parseWorkPlan({ phases, current: call.current, phaseSummary: call.phaseSummary })
}

function skipsPhase(previous: WorkPlan, next: WorkPlan): boolean {
  return (
    next.current > previous.current + 1 &&
    next.phases.length === previous.phases.length &&
    next.phases.every((phase, index) => phase === previous.phases[index])
  )
}
