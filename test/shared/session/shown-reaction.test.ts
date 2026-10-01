import { describe, expect, it } from "vitest"

import {
  type CharacterReactions,
  NO_REACTIONS,
} from "../../../src/shared/character-pack/character-reaction.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { shownReaction } from "../../../src/shared/session/shown-reaction.ts"
import { characterChangedEvent } from "../../fixture/character.ts"

const REACTIONS: CharacterReactions = {
  welcome: [{ text: "架空の迎え", expression: "excited" }],
  accepted: [{ text: "架空の受けた", expression: "thinking" }],
  retrying: [{ text: "架空の再試行", expression: "flustered" }],
  failed: [{ text: "架空の失敗", expression: "sad" }],
  limited: [{ text: "架空の上限", expression: "bored" }],
}

const REQUEST = { kind: "request", text: "架空の依頼", images: [] } as const satisfies SessionEvent

const SPEECH = {
  kind: "speech",
  text: "架空のセリフ",
  expression: "proud",
} as const satisfies SessionEvent

const RETRY = {
  kind: "api-retry",
  retry: { attempt: 1, maxRetries: 10, retryDelayMs: 3000, errorStatus: 529, error: "overloaded" },
} as const satisfies SessionEvent

const API_FAILED = {
  kind: "turn-finished",
  outcome: { kind: "failed", cause: { kind: "api-error" } },
} as const satisfies SessionEvent

const COMPLETED = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent

/** パックを決めてから、`events` を順に畳んだ姿。 */
function stateAfter(
  events: readonly SessionEvent[],
  reactions: CharacterReactions = REACTIONS,
): SessionState {
  return [characterChangedEvent({ reactions }), ...events].reduce(
    (state, event, index) => applySessionEvent(state, event, index),
    INITIAL_SESSION_STATE,
  )
}

/** 出している反応の出来事と文（出していなければ `none`）。 */
function shown(state: SessionState): string {
  const reaction = shownReaction(state)
  return reaction.kind === "shown" ? `${reaction.reaction}:${reaction.line.text}` : "none"
}

describe("shownReaction", () => {
  it.each<[string, readonly SessionEvent[], string]>([
    ["やり取りが無くセリフも無い", [], "welcome:架空の迎え"],
    ["やり取りの前にセリフがある", [SPEECH], "none"],
    ["送った直後", [REQUEST], "accepted:架空の受けた"],
    ["送ったあと speak が届いた", [REQUEST, SPEECH], "none"],
    ["呼び直しを待っている", [REQUEST, RETRY], "retrying:架空の再試行"],
    ["セリフのあとに呼び直しを待っている", [REQUEST, SPEECH, RETRY], "retrying:架空の再試行"],
    ["呼び直しのあと speak が届いた", [REQUEST, RETRY, SPEECH], "none"],
    ["API のエラーで閉じた", [REQUEST, RETRY, API_FAILED], "failed:架空の失敗"],
    [
      "rate_limit のエラーで閉じた",
      [REQUEST, { kind: "api-error", error: "rate_limit" }, API_FAILED],
      "limited:架空の上限",
    ],
    [
      "利用上限に達して閉じた",
      [
        REQUEST,
        SPEECH,
        {
          kind: "rate-limit-changed",
          rateLimit: { kind: "rejected", bucket: "five-hour", resetsAt: undefined },
        },
        API_FAILED,
      ],
      "limited:架空の上限",
    ],
    ["成功で閉じた", [REQUEST, SPEECH, COMPLETED], "none"],
    ["雑談モードで送った直後", [{ kind: "chat-mode-changed", chat: true }, REQUEST], "none"],
  ])("%s", (_, events, expected) => {
    expect(shown(stateAfter(events))).toBe(expected)
  })

  it("パックに反応が無ければ、どの出来事でも出さない", () => {
    expect(shown(stateAfter([], NO_REACTIONS))).toBe("none")
    expect(shown(stateAfter([REQUEST], NO_REACTIONS))).toBe("none")
    expect(shown(stateAfter([REQUEST, RETRY, API_FAILED], NO_REACTIONS))).toBe("none")
  })

  it("行が2つあれば、依頼ごとに順に選ぶ", () => {
    const reactions: CharacterReactions = {
      ...NO_REACTIONS,
      accepted: [
        { text: "1つ目", expression: "default" },
        { text: "2つ目", expression: "default" },
      ],
    }

    const first = shown(stateAfter([REQUEST], reactions))
    const second = shown(stateAfter([REQUEST, COMPLETED, REQUEST], reactions))

    expect([first, second].sort()).toEqual(["accepted:1つ目", "accepted:2つ目"])
  })

  it("反応の行の表情を返す", () => {
    const reaction = shownReaction(stateAfter([REQUEST]))

    expect(reaction.kind === "shown" && reaction.line.expression).toBe("thinking")
  })
})
