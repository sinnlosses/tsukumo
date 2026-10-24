import { describe, expect, it } from "vitest"

import type { WrittenReactions } from "../../../src/shared/recommendation/reaction.ts"
import {
  NO_WELCOME_HEAD,
  type WelcomeHead,
  welcomeGreetingLine,
} from "../../../src/shared/recommendation/welcome-greeting.ts"
import { applyRestoredEvents } from "../../../src/shared/session/restored-event.ts"
import { advanceSessionState } from "../../../src/shared/session/session-advance.ts"
import { sessionEventSchema, type SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { recordTimeAt } from "../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { shownReaction } from "../../../src/shared/session/shown-reaction.ts"
import { turnSpeeches } from "../../../src/shared/session/turn-speech.ts"
import { characterChangedEvent } from "../../fixture/character.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"

/** ターンが閉じてから待ちの一言を出すまでの間（2分）。 */
const WAITING_LINE_DELAY_MS = 120_000

const REQUEST = requestEvent()

const SPEECH = {
  kind: "speech",
  text: "架空のセリフ",
  expression: "proud",
} as const satisfies SessionEvent

const RETRY = {
  kind: "api-retry",
  retry: { attempt: 1, maxRetries: 10, retryDelayMs: 3000, errorStatus: 529, error: "overloaded" },
} as const satisfies SessionEvent

const COMPLETED = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent

const API_FAILED = {
  kind: "turn-finished",
  outcome: { kind: "failed", cause: { kind: "api-error" } },
} as const satisfies SessionEvent

const DUE = { kind: "waiting-line-due" } as const satisfies SessionEvent

const REACTED = {
  kind: "reactions-written",
  reactions: {
    retrying: { text: "架空の再試行", expression: "flustered" },
    failed: { text: "架空の失敗", expression: "sad" },
    limited: { text: "架空の上限", expression: "bored" },
    idle: { text: "架空の待ち", expression: "default" },
  } satisfies WrittenReactions,
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

const SHOWN_WITHOUT_CARD = {
  kind: "welcome-greeting-shown",
  line: { text: "架空の挨拶だけ", expression: "curious" },
} as const satisfies SessionEvent

const WAITING_REPORT = reportEvent({
  waitingLine: { kind: "speech", text: "架空の待ちの一言", expression: "curious" },
})

/** パックを決めてから、`[時刻, イベント]` を順に畳んだ姿。 */
function stateAfter(events: readonly (readonly [number, SessionEvent])[]): SessionState {
  return events.reduce(
    (state, [at, event]) => applySessionEvent(state, event, at),
    applySessionEvent(INITIAL_SESSION_STATE, characterChangedEvent(), 0),
  )
}

/** 積んだ反応の記録を `出来事@時刻:文` に畳む。 */
function reactionRecords(state: SessionState): readonly string[] {
  return state.records.flatMap((record) =>
    record.kind === "reaction"
      ? [`${record.reaction}@${String(recordTimeAt(record.time))}:${record.text}`]
      : [],
  )
}

describe("applySessionEvent の反応の記録", () => {
  it("待ちの一言は、出す時刻の合図で1件積み、同じ待ちの間に合図が重なっても積み直さない", () => {
    const due = 2 + WAITING_LINE_DELAY_MS
    const state = stateAfter([
      [1, REQUEST],
      [2, WAITING_REPORT],
      [2, COMPLETED],
      [due, DUE],
      [due + 5, DUE],
    ])

    expect(reactionRecords(state)).toEqual([`idle@${String(due)}:架空の待ちの一言`])
  })

  it("待ちの一言は、依頼を待つたびに積む", () => {
    const firstDue = 2 + WAITING_LINE_DELAY_MS
    const secondFinished = firstDue + 10
    const secondDue = secondFinished + WAITING_LINE_DELAY_MS
    const state = stateAfter([
      [1, REQUEST],
      [2, COMPLETED],
      [0, REACTED],
      [firstDue, DUE],
      [firstDue + 5, REQUEST],
      [secondFinished, COMPLETED],
      [secondDue, DUE],
    ])

    expect(reactionRecords(state)).toEqual([
      `idle@${String(firstDue)}:架空の待ち`,
      `idle@${String(secondDue)}:架空の待ち`,
    ])
  })

  it("出す時刻より前に合図が届いても積まない", () => {
    const state = stateAfter([
      [1, REQUEST],
      [2, WAITING_REPORT],
      [2, COMPLETED],
      [3, DUE],
    ])

    expect(reactionRecords(state)).toEqual([])
  })

  it("続けて届く再試行は1件に畳み、モデルが何かを出したあとの再試行はもう1件積む", () => {
    const state = stateAfter([
      [0, REACTED],
      [1, REQUEST],
      [2, RETRY],
      [3, RETRY],
      [4, SPEECH],
      [5, RETRY],
    ])

    expect(reactionRecords(state)).toEqual(["retrying@2:架空の再試行", "retrying@5:架空の再試行"])
  })

  it("失敗で閉じたターンは失敗の行を積み、反応の行があとから届いたらそのときに積む", () => {
    const written = stateAfter([
      [0, REACTED],
      [1, REQUEST],
      [2, API_FAILED],
    ])
    const late = stateAfter([
      [1, REQUEST],
      [2, API_FAILED],
      [3, REACTED],
    ])

    expect(reactionRecords(written)).toEqual(["failed@2:架空の失敗"])
    expect(reactionRecords(late)).toEqual(["failed@3:架空の失敗"])
  })

  it("雑談では反応を積まない", () => {
    const state = stateAfter([
      [0, { kind: "chat-mode-changed", chat: true }],
      [0, REACTED],
      [0, GREETED],
      [1, REQUEST],
      [2, RETRY],
      [3, API_FAILED],
    ])

    expect(reactionRecords(state)).toEqual([])
  })

  it("迎えの挨拶は表示した文で積み、/clear のあとの挨拶は依頼より前のまとまりに載る", () => {
    const state = stateAfter([
      [0, GREETED],
      [0, SHOWN_WITHOUT_CARD],
      [1, REQUEST],
      [2, SPEECH],
      [3, COMPLETED],
      [4, { kind: "conversation-cleared" }],
      [5, { kind: "welcome-greeting-changed", state: { kind: "writing" } }],
      [6, GREETED],
      [7, SHOWN_WITHOUT_CARD],
    ])

    expect(reactionRecords(state)).toEqual(["welcome@7:架空の挨拶だけ"])
    expect(
      turnSpeeches(state.records).map((turn) => ({
        request: turn.request,
        texts: turn.speeches.map((speech) => speech.text),
      })),
    ).toEqual([{ request: undefined, texts: ["架空の挨拶だけ"] }])
  })

  it("積んだ反応はそのターンのセリフに、時刻と表情ごと並ぶ", () => {
    const state = stateAfter([
      [0, REACTED],
      [1, REQUEST],
      [2, SPEECH],
      [3, API_FAILED],
    ])

    expect(turnSpeeches(state.records).at(-1)?.speeches).toEqual([
      {
        text: "架空のセリフ",
        expression: "proud",
        time: { kind: "stamped", at: 2 },
        source: "speak",
      },
      {
        text: "架空の失敗",
        expression: "sad",
        time: { kind: "stamped", at: 3 },
        source: "reaction",
      },
    ])
    expect(turnSpeeches(state.records).at(-1)?.expression).toBe("sad")
  })

  describe("吹き出しの時刻は、セリフのログに積んだ記録の時刻と同じ", () => {
    /** いま吹き出しに出している反応と、最後に積んだ反応の記録を、どちらも `出来事@時刻` で並べる。 */
    function balloonAndLog(state: SessionState, now: number): readonly [string, string] {
      const shown = shownReaction(state, NO_WELCOME_HEAD, now)
      const recorded = state.records.findLast((record) => record.kind === "reaction")
      return [
        shown.kind === "shown"
          ? `${shown.reaction}@${String(recordTimeAt(shown.time))}`
          : shown.kind,
        recorded?.kind === "reaction"
          ? `${recorded.reaction}@${String(recordTimeAt(recorded.time))}`
          : "none",
      ]
    }

    const RATE_LIMITED = { kind: "api-error", error: "rate_limit" } as const satisfies SessionEvent

    it.each([
      [
        "再試行が続く",
        [
          [0, REACTED],
          [1, REQUEST],
          [2, RETRY],
          [3, RETRY],
          [4, RETRY],
        ],
        4,
        "retrying@2",
      ],
      [
        "モデルが何かを出したあとの再試行",
        [
          [0, REACTED],
          [1, REQUEST],
          [2, RETRY],
          [3, SPEECH],
          [5, RETRY],
          [6, RETRY],
        ],
        6,
        "retrying@5",
      ],
      [
        "失敗（反応の行が先に届く）",
        [
          [0, REACTED],
          [1, REQUEST],
          [2, API_FAILED],
        ],
        2,
        "failed@2",
      ],
      [
        "失敗（反応の行があとから届く）",
        [
          [1, REQUEST],
          [2, API_FAILED],
          [3, REACTED],
        ],
        3,
        "failed@3",
      ],
      [
        "利用上限",
        [
          [0, REACTED],
          [1, REQUEST],
          [2, RATE_LIMITED],
          [3, API_FAILED],
        ],
        3,
        "limited@3",
      ],
      [
        "利用上限（反応の行があとから届く）",
        [
          [1, REQUEST],
          [2, RATE_LIMITED],
          [3, API_FAILED],
          [4, REACTED],
        ],
        4,
        "limited@4",
      ],
      [
        "待ちの一言（合図が出す時刻より遅れて届く）",
        [
          [0, REACTED],
          [1, REQUEST],
          [2, COMPLETED],
          [2 + WAITING_LINE_DELAY_MS + 500, DUE],
        ],
        2 + WAITING_LINE_DELAY_MS + 500,
        `idle@${String(2 + WAITING_LINE_DELAY_MS)}`,
      ],
      [
        "迎えの挨拶",
        [
          [0, { kind: "welcome-greeting-changed", state: { kind: "writing" } }],
          [6, GREETED],
          [7, SHOWN_WITHOUT_CARD],
        ],
        7,
        "welcome@7",
      ],
    ] satisfies readonly (readonly [
      string,
      readonly (readonly [number, SessionEvent])[],
      number,
      string,
    ])[])("%s", (_, events, now, expected) => {
      expect(balloonAndLog(stateAfter(events), now)).toEqual([expected, expected])
    })

    it("待ちの一言は、合図が届く前に画面の時計で出した時刻と、届いたあとに積んだ記録の時刻が同じ", () => {
      const due = 2 + WAITING_LINE_DELAY_MS
      const before = stateAfter([
        [0, REACTED],
        [1, REQUEST],
        [2, COMPLETED],
      ])
      const after = applySessionEvent(before, DUE, due + 500)

      expect(balloonAndLog(before, due)).toEqual([`idle@${String(due)}`, "none"])
      expect(balloonAndLog(after, due + 500)).toEqual([
        `idle@${String(due)}`,
        `idle@${String(due)}`,
      ])
    })

    it("依頼を挟まない続きのターンのあとの待ちの一言は、前の待ちの記録の時刻を引き継がない", () => {
      const firstDue = 2 + WAITING_LINE_DELAY_MS
      const secondFinished = firstDue + 10
      const secondDue = secondFinished + WAITING_LINE_DELAY_MS
      const waiting = stateAfter([
        [0, REACTED],
        [1, REQUEST],
        [2, COMPLETED],
        [firstDue, DUE],
        [firstDue + 5, { kind: "turn-started" }],
        [secondFinished, COMPLETED],
      ])
      const recorded = applySessionEvent(waiting, DUE, secondDue)

      expect(balloonAndLog(waiting, secondDue)[0]).toBe(`idle@${String(secondDue)}`)
      expect(balloonAndLog(recorded, secondDue)).toEqual([
        `idle@${String(secondDue)}`,
        `idle@${String(secondDue)}`,
      ])
    })
  })

  describe("迎えの挨拶の記録", () => {
    const HEAD: WelcomeHead = { kind: "card", name: "T-1" }

    const SHOWN_WITH_CARD = {
      kind: "welcome-greeting-shown",
      line: welcomeGreetingLine(GREETED.state.greeting, HEAD),
    } as const satisfies SessionEvent

    const GREETED_AGAIN = {
      kind: "welcome-greeting-changed",
      state: {
        kind: "written",
        greeting: {
          withCard: "架空の次の挨拶、{札} はどう？",
          withoutCard: "架空の次の挨拶だけ",
          expression: "excited",
        },
      },
    } as const satisfies SessionEvent

    /** 吹き出しに出している文を `時刻:文` で、積んだ反応の記録と並べる。 */
    function balloonAndLog(
      state: SessionState,
      head: WelcomeHead,
    ): readonly [string, readonly string[]] {
      const shown = shownReaction(state, head, 100)
      return [
        shown.kind === "shown"
          ? `${String(recordTimeAt(shown.time))}:${shown.line.text}`
          : shown.kind,
        reactionRecords(state),
      ]
    }

    it("札ありで出た挨拶は、ログにも札の名前込みの同じ文で残る", () => {
      const state = stateAfter([
        [0, GREETED],
        [1, SHOWN_WITH_CARD],
      ])

      expect(balloonAndLog(state, HEAD)).toEqual([
        "1:架空の挨拶、T-1 からどう？",
        ["welcome@1:架空の挨拶、T-1 からどう？"],
      ])
    })

    it("札なしで出た挨拶も、ログと吹き出しで同じ文になる", () => {
      const state = stateAfter([
        [0, GREETED],
        [1, SHOWN_WITHOUT_CARD],
      ])

      expect(balloonAndLog(state, NO_WELCOME_HEAD)).toEqual([
        "1:架空の挨拶だけ",
        ["welcome@1:架空の挨拶だけ"],
      ])
    })

    it("札が後から決まって文が変わると、記録は1件のまま文を差し替え、時刻は最初に表示したときのまま", () => {
      const state = stateAfter([
        [0, GREETED],
        [1, SHOWN_WITHOUT_CARD],
        [5, SHOWN_WITH_CARD],
      ])

      expect(balloonAndLog(state, HEAD)).toEqual([
        "1:架空の挨拶、T-1 からどう？",
        ["welcome@1:架空の挨拶、T-1 からどう？"],
      ])
    })

    it("記録と同じ文をもう一度受けても、姿は変わらない", () => {
      const state = stateAfter([
        [0, GREETED],
        [1, SHOWN_WITH_CARD],
      ])

      expect(applySessionEvent(state, SHOWN_WITH_CARD, 3)).toBe(state)
    })

    it.each([
      ["組めない文", { text: "架空の別の文", expression: "curious" }],
      ["挨拶と違う表情", { text: "架空の挨拶だけ", expression: "sad" }],
    ] as const)("いまの挨拶から%sは積まない", (_, line) => {
      const state = stateAfter([
        [0, GREETED],
        [1, { kind: "welcome-greeting-shown", line }],
      ])

      expect(reactionRecords(state)).toEqual([])
    })

    it.each([
      [
        "書いている途中",
        [
          [0, { kind: "welcome-greeting-changed", state: { kind: "writing" } }],
          [1, SHOWN_WITH_CARD],
        ],
        [],
      ],
      [
        "依頼のあと（遅れて届いた）",
        [
          [0, GREETED],
          [1, SHOWN_WITHOUT_CARD],
          [2, REQUEST],
          [3, SHOWN_WITH_CARD],
        ],
        ["welcome@1:架空の挨拶だけ"],
      ],
      [
        "再試行の間",
        [
          [0, REACTED],
          [0, GREETED],
          [1, RETRY],
          [2, SHOWN_WITH_CARD],
        ],
        ["retrying@1:架空の再試行"],
      ],
      [
        "雑談",
        [
          [0, { kind: "chat-mode-changed", chat: true }],
          [0, GREETED],
          [1, SHOWN_WITH_CARD],
        ],
        [],
      ],
    ] satisfies readonly (readonly [
      string,
      readonly (readonly [number, SessionEvent])[],
      readonly string[],
    ])[])("迎えの挨拶を出していない姿（%s）に届いた文は積まない", (_, events, expected) => {
      expect(reactionRecords(stateAfter(events))).toEqual(expected)
    })

    it("再試行を挟んでも、挨拶の記録は1件のまま", () => {
      const state = stateAfter([
        [0, REACTED],
        [0, GREETED],
        [1, SHOWN_WITHOUT_CARD],
        [2, RETRY],
        [3, RETRY],
        [4, SHOWN_WITH_CARD],
      ])

      expect(reactionRecords(state)).toEqual([
        "welcome@1:架空の挨拶だけ",
        "retrying@2:架空の再試行",
      ])
    })

    it("挨拶を書けたことだけでは積まない（表示の文が届くまで記録は無い）", () => {
      expect(reactionRecords(stateAfter([[0, GREETED]]))).toEqual([])
    })

    it("/clear のあとの挨拶は新しい1件で積み、前の挨拶の文が遅れて届いても積まない", () => {
      const state = stateAfter([
        [0, GREETED],
        [1, SHOWN_WITH_CARD],
        [2, REQUEST],
        [3, SPEECH],
        [4, COMPLETED],
        [5, { kind: "conversation-cleared" }],
        [6, { kind: "welcome-greeting-changed", state: { kind: "writing" } }],
        [7, GREETED_AGAIN],
        [8, SHOWN_WITH_CARD],
        [
          9,
          {
            kind: "welcome-greeting-shown",
            line: welcomeGreetingLine(GREETED_AGAIN.state.greeting, HEAD),
          },
        ],
      ])

      expect(reactionRecords(state)).toEqual(["welcome@9:架空の次の挨拶、T-1 はどう？"])
    })

    it("続きから起こした直後のおかえりは札の無い文で積み、表示の文が届いても差し替えない", () => {
      const resumed = applyRestoredEvents(
        stateAfter([]),
        [REQUEST, COMPLETED].map((event) => ({ event, time: { kind: "known", at: 1 } as const })),
        2,
      )
      const state = applySessionEvent(applySessionEvent(resumed, GREETED, 3), SHOWN_WITH_CARD, 4)

      expect(reactionRecords(state)).toEqual(["welcome@3:架空の挨拶だけ"])
    })
  })

  it("組み直した出来事では積まない", () => {
    const restored = applyRestoredEvents(
      stateAfter([[0, REACTED]]),
      [REQUEST, RETRY, API_FAILED].map((event) => ({
        event,
        time: { kind: "known", at: 1 } as const,
      })),
      2,
    )

    expect(reactionRecords(restored)).toEqual([])
  })
})

describe("advanceSessionState の知らない kind", () => {
  it("知らない kind のイベントは、姿を同じ参照のまま返す", () => {
    const unknown = sessionEventSchema.parse({ kind: "future-kind" })

    expect(advanceSessionState(INITIAL_SESSION_STATE, unknown, 1)).toBe(INITIAL_SESSION_STATE)
  })
})
