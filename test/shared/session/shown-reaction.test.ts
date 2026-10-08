import { describe, expect, it } from "vitest"

import {
  NO_WELCOME_HEAD,
  type WelcomeHead,
  type WrittenReactions,
} from "../../../src/shared/recommendation/welcome-greeting.ts"
import type { ReportWaitingLine, SessionEvent } from "../../../src/shared/session/session-event.ts"
import {
  applyRestoredEvents,
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import {
  shownReaction,
  WAITING_LINE_DELAY_MS,
  waitingLineDueAt,
} from "../../../src/shared/session/shown-reaction.ts"
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

const API_FAILED = {
  kind: "turn-finished",
  outcome: { kind: "failed", cause: { kind: "api-error" } },
} as const satisfies SessionEvent

const COMPLETED = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent

/** 並びの中の、ここまでが前のセッションを組み直した出来事という印。 */
const RESTORED = "restored" as const

function report(waitingLine: ReportWaitingLine): SessionEvent {
  return reportEvent({ waitingLine })
}

const WRITTEN = report({ kind: "speech", text: "架空の待ちの一言", expression: "curious" })

const WRITTEN_REACTIONS = {
  retrying: { text: "架空の再試行", expression: "flustered" },
  failed: { text: "架空の失敗", expression: "sad" },
  limited: { text: "架空の上限", expression: "bored" },
  idle: { text: "架空の待ち", expression: "default" },
} as const satisfies WrittenReactions

const GREETED = {
  kind: "welcome-greeting-changed",
  state: {
    kind: "written",
    greeting: {
      withCard: "架空の挨拶、{札} からどう？",
      withoutCard: "架空の挨拶だけ",
      expression: "curious",
      reactions: WRITTEN_REACTIONS,
    },
  },
} as const satisfies SessionEvent

/** パックを決めてから、`events` を順に畳んだ姿。 */
function stateAfter(
  events: readonly (SessionEvent | typeof RESTORED)[],
  restoredTime: "known" | "unknown" = "unknown",
): SessionState {
  const marker = events.indexOf(RESTORED)
  const restored = marker === -1 ? [] : events.slice(0, marker)
  const live = marker === -1 ? events : events.slice(marker + 1)
  const withCharacter = applySessionEvent(INITIAL_SESSION_STATE, characterChangedEvent(), 0)
  const afterRestored = applyRestoredEvents(
    withCharacter,
    restored.flatMap((event, index) =>
      event === RESTORED
        ? []
        : [
            {
              event,
              time:
                restoredTime === "known"
                  ? ({ kind: "known", at: index } as const)
                  : ({ kind: "unknown" } as const),
            },
          ],
    ),
    0,
  )
  return live.reduce(
    (state, event, index) =>
      event === RESTORED ? state : applySessionEvent(state, event, restored.length + index),
    afterRestored,
  )
}

/** 出している反応の出来事と文（書いている途中は `writing`、出していなければ `none`）。 */
function shown(state: SessionState, head: WelcomeHead = NO_WELCOME_HEAD, now = 0): string {
  const reaction = shownReaction(state, head, now)
  if (reaction.kind === "shown") {
    return `${reaction.reaction}:${reaction.line.text}`
  }
  return reaction.kind
}

describe("shownReaction", () => {
  it.each<[string, readonly SessionEvent[], string]>([
    ["やり取りが無くセリフも無いが、まだ挨拶を書き始めていない", [], "none"],
    ["やり取りの前にセリフがある", [SPEECH], "none"],
    ["送った直後", [REQUEST], "writing"],
    ["送ったあと speak が届いた", [REQUEST, SPEECH], "none"],
    ["呼び直しを待っている", [GREETED, REQUEST, RETRY], "retrying:架空の再試行"],
    [
      "セリフのあとに呼び直しを待っている",
      [GREETED, REQUEST, SPEECH, RETRY],
      "retrying:架空の再試行",
    ],
    ["呼び直しのあと speak が届いた", [GREETED, REQUEST, RETRY, SPEECH], "none"],
    ["API のエラーで閉じた", [GREETED, REQUEST, RETRY, API_FAILED], "failed:架空の失敗"],
    [
      "rate_limit のエラーで閉じた",
      [GREETED, REQUEST, { kind: "api-error", error: "rate_limit" }, API_FAILED],
      "limited:架空の上限",
    ],
    [
      "利用上限に達して閉じた",
      [
        GREETED,
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

  it.each<[string, readonly SessionEvent[]]>([
    ["書き始める前", []],
    ["書いている途中", [{ kind: "welcome-greeting-changed", state: { kind: "writing" } }]],
    ["書けなかった", [{ kind: "welcome-greeting-changed", state: { kind: "unwritten" } }]],
  ])("挨拶が%sなら、再試行・失敗・利用上限では出さない", (_, greeting) => {
    expect(shown(stateAfter([...greeting, REQUEST, RETRY]))).toBe("none")
    expect(shown(stateAfter([...greeting, REQUEST, RETRY, API_FAILED]))).toBe("none")
    expect(
      shown(
        stateAfter([...greeting, REQUEST, { kind: "api-error", error: "rate_limit" }, API_FAILED]),
      ),
    ).toBe("none")
  })

  it("反応の行の表情を返す", () => {
    const reaction = shownReaction(stateAfter([GREETED, REQUEST, RETRY]), NO_WELCOME_HEAD, 0)

    expect(reaction.kind === "shown" && reaction.line.expression).toBe("flustered")
  })

  describe("待ちの一言", () => {
    const ASKED = {
      kind: "pending-changed",
      pending: [{ kind: "question", id: "架空の問い", questions: [], briefs: [] }],
    } as const satisfies SessionEvent

    /** ターンが閉じた時刻（`stateAfter` は畳んだ順番を時刻にする）から、出す間を過ぎた時刻。 */
    const LATER = WAITING_LINE_DELAY_MS + 100

    it("ターンが閉じてから出す間が経つまでは、何も出さない", () => {
      const state = stateAfter([REQUEST, SPEECH, WRITTEN, COMPLETED])
      const dueAt = waitingLineDueAt(state)

      expect(dueAt).toBeDefined()
      expect(shown(state, NO_WELCOME_HEAD, (dueAt ?? 0) - 1)).toBe("none")
      expect(shown(state, NO_WELCOME_HEAD, dueAt ?? 0)).toBe("idle:架空の待ちの一言")
    })

    it("本体が書いていなければ、挨拶と同じ答えで書かせた待ちの行を出す", () => {
      expect(
        shown(
          stateAfter([GREETED, REQUEST, SPEECH, report({ kind: "none" }), COMPLETED]),
          NO_WELCOME_HEAD,
          LATER,
        ),
      ).toBe("idle:架空の待ち")
      expect(shown(stateAfter([GREETED, REQUEST, SPEECH, COMPLETED]), NO_WELCOME_HEAD, LATER)).toBe(
        "idle:架空の待ち",
      )
    })

    it("本体が書いた待ちの一言は、書かせた待ちの行より勝つ", () => {
      expect(
        shown(stateAfter([GREETED, REQUEST, SPEECH, WRITTEN, COMPLETED]), NO_WELCOME_HEAD, LATER),
      ).toBe("idle:架空の待ちの一言")
    })

    it("本体が書いておらず挨拶も書けていなければ、何も出さない", () => {
      expect(shown(stateAfter([REQUEST, SPEECH, COMPLETED]), NO_WELCOME_HEAD, LATER)).toBe("none")
      expect(
        shown(
          stateAfter([
            { kind: "welcome-greeting-changed", state: { kind: "unwritten" } },
            REQUEST,
            SPEECH,
            COMPLETED,
          ]),
          NO_WELCOME_HEAD,
          LATER,
        ),
      ).toBe("none")
    })

    it("前のやり取りの待ちの一言は使わない", () => {
      expect(
        shown(
          stateAfter([GREETED, REQUEST, WRITTEN, COMPLETED, REQUEST, SPEECH, COMPLETED]),
          NO_WELCOME_HEAD,
          LATER,
        ),
      ).toBe("idle:架空の待ち")
    })

    it("依頼を送れば消え、次のターンが閉じてから数え直す", () => {
      const sent = stateAfter([REQUEST, WRITTEN, COMPLETED, REQUEST])
      const closedAgain = stateAfter([REQUEST, WRITTEN, COMPLETED, REQUEST, SPEECH, COMPLETED])

      expect(waitingLineDueAt(sent)).toBeUndefined()
      expect(shown(sent, NO_WELCOME_HEAD, LATER)).toBe("writing")
      expect(waitingLineDueAt(closedAgain)).toBe(
        closedAgain.turn.kind === "finished"
          ? closedAgain.turn.finishedAt + WAITING_LINE_DELAY_MS
          : "閉じていない",
      )
    })

    it("答え待ち・失敗で閉じた・雑談・背景のタスクを待つ間では出さない", () => {
      const cases = [
        stateAfter([REQUEST, SPEECH, ASKED]),
        stateAfter([GREETED, REQUEST, SPEECH, API_FAILED]),
        stateAfter([{ kind: "chat-mode-changed", chat: true }, REQUEST, SPEECH, COMPLETED]),
        stateAfter([
          REQUEST,
          SPEECH,
          {
            kind: "background-tasks-changed",
            tasks: [{ taskId: "架空の背景", kind: "shell", description: "架空の背景のタスク" }],
          },
          COMPLETED,
        ]),
      ]

      expect(cases.map((state) => waitingLineDueAt(state))).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ])
      expect(cases.map((state) => shown(state, NO_WELCOME_HEAD, LATER))).toEqual([
        "none",
        "failed:架空の失敗",
        "none",
        "none",
      ])
    })

    it("続きから組み直した記録だけのときは、出す時刻を持たない（おかえりが代わりに出る）", () => {
      const state = stateAfter([REQUEST, report({ kind: "none" }), COMPLETED, RESTORED])

      expect(waitingLineDueAt(state)).toBeUndefined()
      expect(shown(state, NO_WELCOME_HEAD, LATER)).toBe("none")
    })
  })

  describe("おかえり（続きから起こしてまだ依頼が無い間）", () => {
    const HEAD: WelcomeHead = { kind: "card", name: "T-1" }

    it("前回の最後のターンの待ちの一言があれば、それを迎えるの反応として表情ごと出す", () => {
      const reaction = shownReaction(
        stateAfter([REQUEST, SPEECH, WRITTEN, COMPLETED, RESTORED, GREETED]),
        HEAD,
        0,
      )

      expect(reaction).toEqual({
        kind: "shown",
        reaction: "welcome",
        line: { text: "架空の待ちの一言", expression: "curious" },
      })
    })

    it("待ちの一言が無ければ、迎えの挨拶を札があっても札なしの文で出す", () => {
      expect(
        shown(
          stateAfter([REQUEST, SPEECH, report({ kind: "none" }), COMPLETED, RESTORED, GREETED]),
          HEAD,
        ),
      ).toBe("welcome:架空の挨拶だけ")
    })

    it("組み直した記録の時刻が transcript から読めていても、おかえりが出る", () => {
      expect(
        shown(stateAfter([REQUEST, WRITTEN, COMPLETED, RESTORED, GREETED], "known"), HEAD),
      ).toBe("welcome:架空の待ちの一言")
    })

    it("前回のより前のやり取りの待ちの一言は使わない", () => {
      expect(
        shown(stateAfter([REQUEST, WRITTEN, COMPLETED, REQUEST, COMPLETED, RESTORED, GREETED])),
      ).toBe("welcome:架空の挨拶だけ")
    })

    it.each<[string, string, SessionEvent | undefined]>([
      ["書き始める前", "none", undefined],
      [
        "書いている途中",
        "writing",
        { kind: "welcome-greeting-changed", state: { kind: "writing" } },
      ],
      ["書けなかった", "none", { kind: "welcome-greeting-changed", state: { kind: "unwritten" } }],
    ])("待ちの一言が無く、挨拶が%sなら %s", (_, expected, greeting) => {
      const events = [REQUEST, COMPLETED, RESTORED, ...(greeting === undefined ? [] : [greeting])]

      expect(shown(stateAfter(events))).toBe(expected)
    })

    it("依頼を送れば消える", () => {
      expect(shown(stateAfter([REQUEST, WRITTEN, COMPLETED, RESTORED, REQUEST]))).toBe("writing")
      expect(
        shown(stateAfter([REQUEST, WRITTEN, COMPLETED, RESTORED, GREETED, REQUEST, SPEECH])),
      ).toBe("none")
    })

    it("雑談では出さない", () => {
      expect(
        shown(
          stateAfter([
            { kind: "chat-mode-changed", chat: true },
            REQUEST,
            WRITTEN,
            COMPLETED,
            RESTORED,
          ]),
        ),
      ).toBe("none")
    })
  })

  describe("迎えの挨拶", () => {
    const WRITING = {
      kind: "welcome-greeting-changed",
      state: { kind: "writing" },
    } as const satisfies SessionEvent

    const UNWRITTEN = {
      kind: "welcome-greeting-changed",
      state: { kind: "unwritten" },
    } as const satisfies SessionEvent

    const HEAD: WelcomeHead = { kind: "card", name: "T-1" }

    it("書いている途中は、「…」を出す印を出す", () => {
      expect(shown(stateAfter([WRITING]), HEAD)).toBe("writing")
    })

    it("書けていて札があれば、先頭の札の名前を差し込んだ文と挨拶の表情を出す", () => {
      const reaction = shownReaction(stateAfter([GREETED]), HEAD, 0)

      expect(reaction).toEqual({
        kind: "shown",
        reaction: "welcome",
        line: { text: "架空の挨拶、T-1 からどう？", expression: "curious" },
      })
    })

    it("書けていて札が無ければ、札なしの文を出す", () => {
      expect(shown(stateAfter([GREETED]))).toBe("welcome:架空の挨拶だけ")
    })

    it("書けなかったら、何も出さない", () => {
      expect(shown(stateAfter([UNWRITTEN]), HEAD)).toBe("none")
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
            reactions: WRITTEN_REACTIONS,
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
