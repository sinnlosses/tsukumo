import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "./tool-use-id.ts"

/** 段A・段B・段C の3フェーズのワークプラン。`current` が今の段の位置。 */
export function plan(
  current: number,
  phaseSummary = "",
  phases: Extract<SessionEvent, { readonly kind: "work-plan" }>["phases"] = [
    "架空の段A",
    "架空の段B",
    "架空の段C",
  ],
): Extract<SessionEvent, { readonly kind: "work-plan" }> {
  return {
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phaseIds: [],
    phases,
    current,
    finishedInGroup: [],
    phaseSummary,
  }
}

export function bashStarted(id: string): SessionEvent {
  return {
    kind: "tool-started",
    toolUseId: checkedToolUseId(id),
    name: "Bash",
    input: { command: `架空のコマンド ${id}` },
    parentToolUseId: undefined,
  }
}

export function bashFinished(id: string): SessionEvent {
  return {
    kind: "tool-finished",
    toolUseId: checkedToolUseId(id),
    content: "架空の結果",
    isError: false,
  }
}

export function stateAfter(events: readonly SessionEvent[]): SessionState {
  return events.reduce(
    (state, event, index) => applySessionEvent(state, event, index),
    INITIAL_SESSION_STATE,
  )
}
