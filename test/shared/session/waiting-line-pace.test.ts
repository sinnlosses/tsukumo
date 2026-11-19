import { describe, expect, it } from "vitest"

import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { waitingLineDueAt } from "../../../src/shared/session/shown-reaction.ts"
import { characterChangedEvent } from "../../fixture/character.ts"
import { requestEvent } from "../../fixture/session-event.ts"

const FINISHED_AT = 4

function closedTurnState(waitingLine: "1m" | "2m" | "off"): SessionState {
  const events: readonly SessionEvent[] = [
    characterChangedEvent(),
    {
      kind: "speaking-pace-changed",
      speakingPace: { waitingLine, progressNudge: "5m" },
      scope: "launch",
    },
    requestEvent(),
    { kind: "speech", text: "架空のセリフ", expression: "proud" },
    { kind: "turn-finished", outcome: { kind: "completed" } },
  ]
  return events.reduce(
    (state, event, index) => applySessionEvent(state, event, index),
    INITIAL_SESSION_STATE,
  )
}

describe("waitingLineDueAt の間", () => {
  it("起こしたときの間が1分なら、ターンが閉じて60秒後が時刻になる", () => {
    expect(waitingLineDueAt(closedTurnState("1m"))).toBe(FINISHED_AT + 60_000)
  })

  it("既定の2分なら120秒後が時刻になる", () => {
    expect(waitingLineDueAt(closedTurnState("2m"))).toBe(FINISHED_AT + 120_000)
  })

  it("「出さない」では時刻が無い", () => {
    expect(waitingLineDueAt(closedTurnState("off"))).toBeUndefined()
  })
})
