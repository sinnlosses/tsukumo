import { describe, expect, it } from "vitest"

import type { AizuchiPair, AizuchiPairs } from "../../../src/shared/recommendation/aizuchi.ts"
import { NO_WELCOME_HEAD } from "../../../src/shared/recommendation/welcome-greeting.ts"
import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { shownAizuchi } from "../../../src/shared/session/shown-aizuchi.ts"
import { shownReaction } from "../../../src/shared/session/shown-reaction.ts"
import { turnSpeeches } from "../../../src/shared/session/turn-speech.ts"
import { characterChangedEvent } from "../../fixture/character.ts"
import { requestEvent } from "../../fixture/session-event.ts"

// すべて手で書いた架空の札と返事。

function pairs(moment: string): readonly AizuchiPair[] {
  return [0, 1, 2].map((index) => ({
    chip: `${moment}の札${String(index)}`,
    reply: `${moment}の返事${String(index)}`,
    expression: "proud",
  }))
}

const WRITTEN = {
  kind: "aizuchi-written",
  pairs: { deliver: pairs("渡す"), stumble: pairs("つまずく"), work: pairs("働く") },
} as const satisfies Extract<SessionEvent, { readonly kind: "aizuchi-written" }> & {
  readonly pairs: AizuchiPairs
}

const REQUEST = requestEvent()
const COMPLETED = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent
const API_FAILED = {
  kind: "turn-finished",
  outcome: { kind: "failed", cause: { kind: "api-error" } },
} as const satisfies SessionEvent
const SPEECH = { kind: "speech", text: "架空のセリフ", expression: "curious" } as const

function press(moment: "deliver" | "stumble" | "work", index: number): SessionEvent {
  return { kind: "aizuchi-pressed", moment, index }
}

function stateAfter(events: readonly SessionEvent[]): SessionState {
  return events.reduce(
    (state, event, position) => applySessionEvent(state, event, position + 1),
    applySessionEvent(INITIAL_SESSION_STATE, characterChangedEvent(), 0),
  )
}

function chips(state: SessionState): readonly string[] {
  return shownAizuchi(state).map(({ chip }) => chip)
}

describe("相づちの札", () => {
  it("局面の表の枚数を、まだ押していない組の前から順に出す", () => {
    expect(chips(stateAfter([WRITTEN]))).toEqual([])
    expect(chips(stateAfter([WRITTEN, REQUEST]))).toEqual(["働くの札0"])
    expect(chips(stateAfter([WRITTEN, REQUEST, COMPLETED]))).toEqual(["渡すの札0", "渡すの札1"])
    expect(chips(stateAfter([WRITTEN, REQUEST, API_FAILED]))).toEqual(["つまずくの札0"])
  })

  it("書けていない代では出さない", () => {
    expect(chips(stateAfter([REQUEST, COMPLETED]))).toEqual([])
  })

  it("押すと局面にいるあいだ札を引っ込め、局面が戻っても押した組は出さない", () => {
    const pressed = stateAfter([WRITTEN, REQUEST, COMPLETED, press("deliver", 0)])
    expect(chips(pressed)).toEqual([])

    const again = stateAfter([WRITTEN, REQUEST, COMPLETED, press("deliver", 0), REQUEST, COMPLETED])
    expect(chips(again)).toEqual(["渡すの札1", "渡すの札2"])
  })

  it("3組とも押した局面には、その代のあいだ札を出さない", () => {
    const state = stateAfter([
      WRITTEN,
      REQUEST,
      COMPLETED,
      press("deliver", 0),
      REQUEST,
      COMPLETED,
      press("deliver", 1),
      REQUEST,
      COMPLETED,
      press("deliver", 2),
      REQUEST,
      COMPLETED,
    ])

    expect(chips(state)).toEqual([])
  })
})

describe("相づちの札を押す", () => {
  it("利用者の札の行と返事の反応の行を記録に積み、返事を吹き出しに出す", () => {
    const state = stateAfter([WRITTEN, REQUEST, COMPLETED, press("deliver", 1)])

    expect(state.records.slice(-2)).toEqual([
      { kind: "aizuchi-chip", text: "渡すの札1", time: { kind: "stamped", at: 4 } },
      {
        kind: "reaction",
        reaction: "aizuchi",
        text: "渡すの返事1",
        expression: "proud",
        time: { kind: "stamped", at: 4 },
      },
    ])
    expect(shownReaction(state, NO_WELCOME_HEAD, 10)).toMatchObject({
      kind: "shown",
      reaction: "aizuchi",
      line: { text: "渡すの返事1", expression: "proud" },
    })
  })

  it("利用者の札の行は、ターンのセリフの並びに直前の顔のまま `you` として入る", () => {
    const state = stateAfter([WRITTEN, REQUEST, SPEECH, COMPLETED, press("deliver", 1)])

    expect(
      turnSpeeches(state.records)
        .at(-1)
        ?.speeches.map(({ text, source, expression }) => ({ text, source, expression })),
    ).toEqual([
      { text: "架空のセリフ", source: "speak", expression: "curious" },
      { text: "渡すの札1", source: "you", expression: "curious" },
      { text: "渡すの返事1", source: "reaction", expression: "proud" },
    ])
  })

  it("本物の speak が届くと返事は消える", () => {
    const state = stateAfter([WRITTEN, REQUEST, COMPLETED, press("deliver", 0), SPEECH])

    expect(shownReaction(state, NO_WELCOME_HEAD, 10).kind).not.toBe("shown")
  })

  it("作業中に押しても、ターン・答え待ち・メインビューの記録は変わらない", () => {
    const before = stateAfter([WRITTEN, REQUEST])
    const after = applySessionEvent(before, press("work", 0), 9)

    expect(after.turn).toEqual(before.turn)
    expect(after.pending).toEqual(before.pending)
    expect(mainViewEntries(after)).toEqual(mainViewEntries(before))
    expect(shownReaction(after, NO_WELCOME_HEAD, 10)).toMatchObject({ reaction: "aizuchi" })
  })

  it("出していない組・押し済みの組では何も変わらない", () => {
    const base = stateAfter([WRITTEN, REQUEST, COMPLETED, press("deliver", 0)])

    expect(applySessionEvent(base, press("deliver", 0), 9).records).toEqual(base.records)
    expect(applySessionEvent(base, press("work", 7), 9).records).toEqual(base.records)
    expect(applySessionEvent(INITIAL_SESSION_STATE, press("work", 0), 9).records).toEqual([])
  })
})
