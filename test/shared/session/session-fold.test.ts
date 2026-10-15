import { describe, expect, it } from "vitest"

import type { WrittenReactions } from "../../../src/shared/recommendation/reaction.ts"
import { NO_WELCOME_HEAD } from "../../../src/shared/recommendation/welcome-greeting.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  applyRestoredEvents,
  INITIAL_SESSION_STATE,
  recordTimeAt,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { shownReaction, WAITING_LINE_DELAY_MS } from "../../../src/shared/session/shown-reaction.ts"
import { turnSpeeches } from "../../../src/shared/session/turn-speech.ts"
import { characterChangedEvent } from "../../fixture/character.ts"
import { reportEvent } from "../../fixture/report-event.ts"

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

  it("迎えの挨拶は札の無い文で積み、/clear のあとの挨拶は依頼より前のまとまりに載る", () => {
    const state = stateAfter([
      [0, GREETED],
      [1, REQUEST],
      [2, SPEECH],
      [3, COMPLETED],
      [4, { kind: "conversation-cleared" }],
      [5, { kind: "welcome-greeting-changed", state: { kind: "writing" } }],
      [6, GREETED],
    ])

    expect(reactionRecords(state)).toEqual(["welcome@6:架空の挨拶だけ"])
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
        ],
        6,
        "welcome@6",
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
