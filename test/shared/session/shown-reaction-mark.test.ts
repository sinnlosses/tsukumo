import { describe, expect, it } from "vitest"

import type { WrittenReactions } from "../../../src/shared/recommendation/reaction.ts"
import {
  NO_WELCOME_HEAD,
  type WelcomeHead,
} from "../../../src/shared/recommendation/welcome-greeting.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { shownReaction } from "../../../src/shared/session/shown-reaction.ts"
import { characterChangedEvent } from "../../fixture/character.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"

// すべて手で書いた架空の材料。

/** ターンが閉じてから待ちの一言を出すまでの間（2分）。 */
const WAITING_LINE_DELAY_MS = 120_000
const LATER = WAITING_LINE_DELAY_MS + 100

const REQUEST = requestEvent()
const SPEECH = { kind: "speech", text: "架空のセリフ", expression: "proud" } as const
const COMPLETED = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent
const API_FAILED = {
  kind: "turn-finished",
  outcome: { kind: "failed", cause: { kind: "api-error" } },
} as const satisfies SessionEvent
const RETRY = {
  kind: "api-retry",
  retry: { attempt: 3, maxRetries: 10, retryDelayMs: 3000, errorStatus: 529, error: "overloaded" },
} as const satisfies SessionEvent
const WAITING_SPEECH = reportEvent({
  waitingLine: { kind: "speech", text: "架空の待ちの一言", expression: "curious" },
})

const RESETS_AT = 1_800_000_000_000
const LIMITED = {
  kind: "rate-limit-changed",
  rateLimit: { kind: "rejected", bucket: "five-hour", resetsAt: RESETS_AT },
} as const satisfies SessionEvent
const LIMITED_WITHOUT_TIME = {
  kind: "rate-limit-changed",
  rateLimit: { kind: "rejected", bucket: "five-hour" },
} as const satisfies SessionEvent

const REACTED = {
  kind: "reactions-written",
  reactions: {
    retrying: { withMark: "架空の{回数}回目", withoutMark: "架空の再試行", expression: "default" },
    failed: { text: "架空の失敗", expression: "default" },
    limited: { withMark: "架空の{時刻}まで", withoutMark: "架空の上限", expression: "default" },
    idle: { withMark: "架空の{札}から", withoutMark: "架空の待ち", expression: "default" },
  } satisfies WrittenReactions,
} as const satisfies SessionEvent

const CARD = { kind: "card", name: "架空の札" } as const satisfies WelcomeHead
const CLOCK = (resetsAt: number, now: number) => `${String(resetsAt)}@${String(now)}`

function stateAfter(events: readonly SessionEvent[]): SessionState {
  return events.reduce(
    (state, event, index) => applySessionEvent(state, event, index + 1),
    applySessionEvent(INITIAL_SESSION_STATE, characterChangedEvent(), 0),
  )
}

/** 出している反応の文。時刻の字を組む関数は {@link CLOCK}（`withClock` が false なら渡さない）。 */
function lineText(state: SessionState, head: WelcomeHead, now = 0, withClock = true): string {
  const reaction = shownReaction(state, head, now, withClock ? CLOCK : undefined)
  return reaction.kind === "shown" ? reaction.line.text : reaction.kind
}

describe("shownReaction の印を持つ文への値の差し込み", () => {
  it("再試行は何回目かを差し込む", () => {
    expect(lineText(stateAfter([REACTED, REQUEST, RETRY]), NO_WELCOME_HEAD)).toBe("架空の3回目")
  })

  it("利用上限は戻る時刻を差し込む", () => {
    expect(lineText(stateAfter([REACTED, REQUEST, LIMITED, API_FAILED]), NO_WELCOME_HEAD, 7)).toBe(
      `架空の${String(RESETS_AT)}@7まで`,
    )
  })

  it("利用上限は、戻る時刻が無い・時刻の字を組む関数が無いときは印の無い文を出す", () => {
    expect(
      lineText(stateAfter([REACTED, REQUEST, LIMITED_WITHOUT_TIME, API_FAILED]), NO_WELCOME_HEAD),
    ).toBe("架空の上限")
    expect(
      lineText(stateAfter([REACTED, REQUEST, LIMITED, API_FAILED]), NO_WELCOME_HEAD, 0, false),
    ).toBe("架空の上限")
  })

  it("待ちの行は先頭の札を差し込み、札が無ければ印の無い文を出す", () => {
    const state = stateAfter([REACTED, REQUEST, SPEECH, COMPLETED])

    expect(lineText(state, CARD, LATER)).toBe("架空の架空の札から")
    expect(lineText(state, NO_WELCOME_HEAD, LATER)).toBe("架空の待ち")
  })

  it("待ちの一言があれば、札があってもそれが出る", () => {
    expect(
      lineText(stateAfter([REACTED, REQUEST, SPEECH, WAITING_SPEECH, COMPLETED]), CARD, LATER),
    ).toBe("架空の待ちの一言")
  })

  it("失敗は印を持たない", () => {
    expect(lineText(stateAfter([REACTED, REQUEST, API_FAILED]), CARD)).toBe("架空の失敗")
  })
})
