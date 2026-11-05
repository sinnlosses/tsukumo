// ワークフロースクリプトの手順と写しのイベントを畳んで次のセッションの姿を返す純粋関数。

import type { SessionEvent } from "./session-event.ts"
import { workPlanRecords } from "./session-record-edit.ts"
import type { SessionState } from "./session-state.ts"
import { foldWorkflowEvent } from "./workflow-event-fold.ts"

export function advanceByWorkflowStep(
  state: SessionState,
  event: Extract<
    SessionEvent,
    { readonly kind: "workflow-step-started" | "workflow-step-finished" }
  >,
  at: number,
): SessionState {
  return { ...state, ...foldWorkflowEvent(state, event, at) }
}

/** 写しを差し替え、写しで今のワークプランが進んだらその記録を積む。 */
export function advanceByWorkflowProgress(
  state: SessionState,
  event: Extract<SessionEvent, { readonly kind: "workflow-progress" }>,
  at: number,
): SessionState {
  return {
    ...state,
    ...foldWorkflowEvent(state, event, at),
    records: [...state.records, ...workPlanRecords(state.records, event, at)],
  }
}
