import { describe, expect, it } from "vitest"

import {
  arrivingBubbleOf,
  newestVoicesOf,
  SPEECH_ARRIVALS,
  speechArrivalOf,
} from "../../../../../../src/browser/components/page/conversation/domain/speech-arrival.ts"
import { EXPRESSIONS } from "../../../../../../src/shared/character-pack/expression.ts"
import type { SessionRecord } from "../../../../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../src/shared/session/session-state.ts"
import { FIXTURE_CHARACTER } from "../../../../../fixture/character-view.tsx"
import {
  reactionRecord,
  reportRecord,
  requestRecord,
  speechRecord,
} from "../../../../../fixture/session-record.ts"

const AT = 5000

function stateOf(
  records: readonly SessionRecord[],
  patch: Partial<SessionState> = {},
): SessionState {
  return { ...INITIAL_SESSION_STATE, records, ...patch }
}

const TURN_OF_TWO = [
  requestRecord({ turnId: 0 }),
  speechRecord({ text: "1" }),
  speechRecord({ text: "2" }),
]

const GREETING = {
  withCard: "架空の挨拶 {札}",
  withoutCard: "架空の挨拶",
  expression: "excited",
} as const

describe("speechArrivalOf", () => {
  it("同じやり取りで声が増えると、届いた（位置は件数 - 1・表情は最後の声）", () => {
    const next = [...TURN_OF_TWO, speechRecord({ text: "3", expression: "sad" })]
    const arrival = speechArrivalOf(
      newestVoicesOf(stateOf(TURN_OF_TWO)),
      newestVoicesOf(stateOf(next)),
      AT,
    )
    expect(arrival).toEqual({ kind: "arrived", turnId: 0, index: 2, expression: "sad", at: AT })
  })

  it("声が増えずほかの記録だけが増えても無い", () => {
    const next = [...TURN_OF_TWO, reportRecord()]
    expect(
      speechArrivalOf(newestVoicesOf(stateOf(TURN_OF_TWO)), newestVoicesOf(stateOf(next)), AT),
    ).toEqual({ kind: "none" })
  })

  it("新しい依頼が届いて声が 0 件なら無い", () => {
    const next = [...TURN_OF_TWO, requestRecord({ turnId: 1 })]
    expect(
      speechArrivalOf(newestVoicesOf(stateOf(TURN_OF_TWO)), newestVoicesOf(stateOf(next)), AT),
    ).toEqual({ kind: "none" })
  })

  it("新しいやり取りの声が 1 件届くと、位置 0 で届いた", () => {
    const next = [...TURN_OF_TWO, requestRecord({ turnId: 1 }), speechRecord({ text: "新" })]
    expect(
      speechArrivalOf(newestVoicesOf(stateOf(TURN_OF_TWO)), newestVoicesOf(stateOf(next)), AT),
    ).toMatchObject({ kind: "arrived", turnId: 1, index: 0 })
  })

  it("迎える場面で挨拶を書いている途中から書けたら、挨拶の表情で届いた", () => {
    const writing = stateOf([], {
      character: FIXTURE_CHARACTER,
      welcomeGreeting: { kind: "writing" },
    })
    const written = {
      ...writing,
      welcomeGreeting: { kind: "written", greeting: GREETING },
    } satisfies SessionState
    expect(speechArrivalOf(newestVoicesOf(writing), newestVoicesOf(written), AT)).toMatchObject({
      kind: "arrived",
      index: 0,
      expression: "excited",
    })
  })

  it("挨拶を出していて記録が無いあいだから、記録が積まれても無い", () => {
    const shown = stateOf([], {
      character: FIXTURE_CHARACTER,
      welcomeGreeting: { kind: "written", greeting: GREETING },
    })
    const recorded = {
      ...shown,
      records: [reactionRecord({ reaction: "welcome", expression: "excited" })],
    }
    expect(speechArrivalOf(newestVoicesOf(shown), newestVoicesOf(recorded), AT)).toEqual({
      kind: "none",
    })
  })

  it("挨拶の文が札で替わって記録の文だけ差し替わっても無い", () => {
    const before = stateOf([reactionRecord({ reaction: "welcome", text: "旧" })], {
      character: FIXTURE_CHARACTER,
      welcomeGreeting: { kind: "written", greeting: GREETING },
    })
    const after = { ...before, records: [reactionRecord({ reaction: "welcome", text: "新" })] }
    expect(speechArrivalOf(newestVoicesOf(before), newestVoicesOf(after), AT)).toEqual({
      kind: "none",
    })
  })

  it("前か次のどちらかが雑談なら、声が増えても無い", () => {
    const next = [...TURN_OF_TWO, speechRecord({ text: "3" })]
    expect(
      speechArrivalOf(
        newestVoicesOf(stateOf(TURN_OF_TWO)),
        newestVoicesOf(stateOf(next, { chatMode: true })),
        AT,
      ),
    ).toEqual({ kind: "none" })
    expect(
      speechArrivalOf(
        newestVoicesOf(stateOf(TURN_OF_TWO, { chatMode: true })),
        newestVoicesOf(stateOf(next)),
        AT,
      ),
    ).toEqual({ kind: "none" })
  })
})

describe("arrivingBubbleOf", () => {
  const ARRIVED = { kind: "arrived", turnId: 3, index: 2, expression: "proud", at: AT } as const
  const WINDOW = 800

  it("窓の中は、やり取りの番号・位置・表の出方を返す", () => {
    expect(arrivingBubbleOf(ARRIVED, AT + WINDOW - 1)).toEqual({
      kind: "arriving",
      turnId: 3,
      index: 2,
      bubble: "swell",
    })
  })

  it("窓を過ぎると無い。届いていなければ無い", () => {
    expect(arrivingBubbleOf(ARRIVED, AT + WINDOW)).toEqual({ kind: "none" })
    expect(arrivingBubbleOf({ kind: "none" }, AT)).toEqual({ kind: "none" })
  })
})

describe("SPEECH_ARRIVALS", () => {
  it("9つの表情のキーを持ち、動きと出方が決めた対応どおり", () => {
    expect(Object.keys(SPEECH_ARRIVALS).toSorted()).toEqual([...EXPRESSIONS].toSorted())
    expect(SPEECH_ARRIVALS).toEqual({
      default: { motion: "nod", bubble: "pop", manpu: "none" },
      thinking: { motion: "lean", bubble: "ease", manpu: "thought" },
      proud: { motion: "success", bubble: "swell", manpu: "sparkle" },
      excited: { motion: "success", bubble: "swell", manpu: "petals" },
      flustered: { motion: "failure", bubble: "shake", manpu: "sweat" },
      curious: { motion: "tilt", bubble: "ease", manpu: "ripple" },
      sad: { motion: "sink", bubble: "sink", manpu: "rain" },
      bored: { motion: "sink", bubble: "sink", manpu: "bubbles" },
      serious: { motion: "still", bubble: "snap", manpu: "flash" },
    })
  })
})
