import { renderHook } from "@testing-library/react"
import { vi } from "vitest"

import {
  useWorkStrip,
  type WorkStripModel,
} from "../../src/browser/components/page/conversation/components/main-view/components/work-strip/hooks/use-work-strip.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../src/shared/session/session-state.ts"
import { putSession } from "../browser/session-store.ts"

export const START = 1_700_000_000_000

export const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
export const plan: Extract<SessionEvent, { readonly kind: "work-plan" }> = {
  kind: "work-plan",
  delegatedRange: { kind: "none" },
  skippedPhases: [],
  awaitingSummary: { kind: "none" },
  phases: ["架空の段A", "架空の段B"],
  current: 0,
  finishedInGroup: [],
  phaseSummary: "",
}

export function foldTimed(events: readonly (readonly [SessionEvent, number])[]): SessionState {
  return events.reduce(
    (state, [event, at]) => applySessionEvent(state, event, at),
    INITIAL_SESSION_STATE,
  )
}

export function stripAt(state: SessionState, now: number): WorkStripModel {
  vi.spyOn(Temporal.Now, "instant").mockReturnValue(Temporal.Instant.fromEpochMilliseconds(now))
  putSession(state)
  return renderHook(() => useWorkStrip()).result.current
}
