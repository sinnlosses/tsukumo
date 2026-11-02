import { describe, expect, it } from "vitest"

import type { ChatConsolidationOutcome } from "../../../../../src/server/chat/core/consolidation/chat-consolidation-writer.ts"
import {
  consolidationPackToStart,
  isBatched,
  mayFlowTopics,
} from "../../../../../src/server/session/core/event/event-judgement.ts"
import type { SessionEvent } from "../../../../../src/shared/session/session-event.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { characterInfo, characterPackName } from "../../../../fixture/character.ts"

const TURN_FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "interrupted" } }
const SPEAK_DRAWN: SessionEvent = { kind: "speak-drawn" }
const TOKEN_USAGE: SessionEvent = { kind: "token-usage", cumulative: [] }

describe("isBatched", () => {
  it("計測のためだけのイベントは積まない", () => {
    expect(isBatched(TURN_FINISHED)).toBe(true)
    expect(isBatched(SPEAK_DRAWN)).toBe(false)
    expect(isBatched(TOKEN_USAGE)).toBe(false)
  })
})

describe("consolidationPackToStart", () => {
  it("ターンの終わり以外では起こさない", () => {
    const state = { ...INITIAL_SESSION_STATE, character: characterInfo({ pack: "a" }) }

    expect(consolidationPackToStart(SPEAK_DRAWN, state)).toBe(undefined)
  })

  it("ターンの終わりでも、パックが無ければ起こさない", () => {
    expect(consolidationPackToStart(TURN_FINISHED, INITIAL_SESSION_STATE)).toBe(undefined)
  })

  it("ターンの終わりで、パックがあれば起こす", () => {
    const state = { ...INITIAL_SESSION_STATE, character: characterInfo({ pack: "a" }) }

    expect(consolidationPackToStart(TURN_FINISHED, state)).toBe(characterPackName("a"))
  })
})

describe("mayFlowTopics", () => {
  const written: ChatConsolidationOutcome = {
    kind: "written",
    topics: [],
    droppedLines: 0,
    shrinkWaived: false,
  }
  const notDue: ChatConsolidationOutcome = { kind: "not-due" }
  const pack = characterPackName("a")
  const chatting = (packName: string, chatMode: boolean): SessionState => ({
    ...INITIAL_SESSION_STATE,
    chatMode,
    character: characterInfo({ pack: packName }),
  })

  it("書けていて、開いていて、雑談で同じパックのときだけ流す", () => {
    expect(mayFlowTopics(written, false, chatting("a", true), pack)).toBe(true)
    expect(mayFlowTopics(notDue, false, chatting("a", true), pack)).toBe(false)
    expect(mayFlowTopics(written, true, chatting("a", true), pack)).toBe(false)
    expect(mayFlowTopics(written, false, chatting("b", true), pack)).toBe(false)
    expect(mayFlowTopics(written, false, chatting("a", false), pack)).toBe(false)
  })
})
