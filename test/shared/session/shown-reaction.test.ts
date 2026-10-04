import { describe, expect, it } from "vitest"

import {
  type CharacterReactions,
  NO_REACTIONS,
} from "../../../src/shared/character-pack/character-reaction.ts"
import {
  NO_WELCOME_HEAD,
  type WelcomeHead,
} from "../../../src/shared/recommendation/welcome-greeting.ts"
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

/** 出している反応の出来事と文（書いている途中は `writing`、出していなければ `none`）。 */
function shown(state: SessionState, head: WelcomeHead = NO_WELCOME_HEAD): string {
  const reaction = shownReaction(state, head)
  if (reaction.kind === "shown") {
    return `${reaction.reaction}:${reaction.line.text}`
  }
  return reaction.kind
}

describe("shownReaction", () => {
  it.each<[string, readonly SessionEvent[], string]>([
    ["やり取りが無くセリフも無いが、まだ挨拶を書き始めていない", [], "none"],
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
    const reaction = shownReaction(stateAfter([REQUEST]), NO_WELCOME_HEAD)

    expect(reaction.kind === "shown" && reaction.line.expression).toBe("thinking")
  })

  describe("迎えの挨拶", () => {
    const WRITING = {
      kind: "welcome-greeting-changed",
      state: { kind: "writing" },
    } as const satisfies SessionEvent

    const FALLBACK = {
      kind: "welcome-greeting-changed",
      state: { kind: "fallback" },
    } as const satisfies SessionEvent

    const GREETED = {
      kind: "welcome-greeting-changed",
      state: {
        kind: "written",
        greeting: {
          withCard: "架空の挨拶、{札} からどう？",
          withoutCard: "架空の挨拶だけ",
          expression: "curious",
        },
      },
    } as const satisfies SessionEvent

    const HEAD: WelcomeHead = { kind: "card", name: "T-1" }

    it("書き始める前は、何も出さない", () => {
      expect(shown(stateAfter([]), HEAD)).toBe("none")
    })

    it("書いている途中は、「…」を出す印を出す", () => {
      expect(shown(stateAfter([WRITING]), HEAD)).toBe("writing")
    })

    it("書けていて札があれば、先頭の札の名前を差し込んだ文と挨拶の表情を出す", () => {
      const reaction = shownReaction(stateAfter([GREETED]), HEAD)

      expect(reaction).toEqual({
        kind: "shown",
        reaction: "welcome",
        line: { text: "架空の挨拶、T-1 からどう？", expression: "curious" },
      })
    })

    it("書けていて札が無ければ、札なしの文を出す", () => {
      expect(shown(stateAfter([GREETED]))).toBe("welcome:架空の挨拶だけ")
    })

    it("控えに替わったら、パックの迎えの行を出す", () => {
      expect(shown(stateAfter([FALLBACK]), HEAD)).toBe("welcome:架空の迎え")
    })

    it("控えに替わっても、パックに迎えの行が無ければ出さない", () => {
      expect(shown(stateAfter([FALLBACK], NO_REACTIONS), HEAD)).toBe("none")
    })

    it("パックに迎えの行が無くても、書けていれば出す", () => {
      expect(shown(stateAfter([GREETED], NO_REACTIONS), HEAD)).toBe(
        "welcome:架空の挨拶、T-1 からどう？",
      )
    })

    it("迎える局面を過ぎたら出さない", () => {
      expect(shown(stateAfter([GREETED, REQUEST, SPEECH]), HEAD)).toBe("none")
    })

    it("/clear のあとは古い挨拶が消え、新しく届くまで何も出さない", () => {
      expect(
        shown(
          stateAfter([GREETED, REQUEST, SPEECH, COMPLETED, { kind: "conversation-cleared" }]),
          HEAD,
        ),
      ).toBe("none")
    })

    it("/clear のあとに新しく書けば、新しいほうだけを出す", () => {
      const secondGreeting = {
        kind: "welcome-greeting-changed",
        state: {
          kind: "written",
          greeting: {
            withCard: "架空の2回目の挨拶 {札}",
            withoutCard: "架空の2回目の挨拶",
            expression: "excited",
          },
        },
      } as const satisfies SessionEvent

      expect(
        shown(
          stateAfter([
            GREETED,
            REQUEST,
            SPEECH,
            COMPLETED,
            { kind: "conversation-cleared" },
            secondGreeting,
          ]),
          HEAD,
        ),
      ).toBe("welcome:架空の2回目の挨拶 T-1")
    })
  })
})
