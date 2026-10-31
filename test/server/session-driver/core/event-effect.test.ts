import { describe, expect, it } from "vitest"

import { effectsOfEvent } from "../../../../src/server/session-driver/core/event-effect.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { CHAT_MODE, WORK_MODE } from "../../../fixture/sdk-tool.ts"

const OUTCOME = { kind: "interrupted" } as const
const TURN_FINISHED: SessionEvent = { kind: "turn-finished", outcome: OUTCOME }
const CLEARED: SessionEvent = { kind: "conversation-cleared" }

describe("effectsOfEvent", () => {
  it("メインの会話のターンの終わりは、台帳・人格の区切り・印と題の順にやる", () => {
    expect(CHAT_MODE.kind).toBe("chat")
    if (CHAT_MODE.kind !== "chat") {
      return
    }

    expect(effectsOfEvent(TURN_FINISHED, true, CHAT_MODE, "s1")).toEqual([
      { kind: "append-input-ledger", outcome: OUTCOME },
      { kind: "finish-persona-turn", personaMemory: CHAT_MODE.personaMemory },
      { kind: "mark-session-and-write-title", sessionId: "s1" },
    ])
  })

  it("サブエージェントのターンの終わりは台帳に書かない", () => {
    const kinds = effectsOfEvent(TURN_FINISHED, false, CHAT_MODE, "s1").map((e) => e.kind)

    expect(kinds).toEqual(["finish-persona-turn", "mark-session-and-write-title"])
  })

  it("作業のセッションは人格の区切りをしない", () => {
    const kinds = effectsOfEvent(TURN_FINISHED, true, WORK_MODE, "s1").map((e) => e.kind)

    expect(kinds).toEqual(["append-input-ledger", "mark-session-and-write-title"])
  })

  it("セッションIDが未受領なら印と題をやらない", () => {
    const kinds = effectsOfEvent(TURN_FINISHED, true, WORK_MODE, undefined).map((e) => e.kind)

    expect(kinds).toEqual(["append-input-ledger"])
  })

  it("会話の消去は、会話では写しの印を戻し、どちらでも題へ知らせる", () => {
    expect(effectsOfEvent(CLEARED, true, CHAT_MODE, "s1").map((e) => e.kind)).toEqual([
      "mark-summary-undelivered",
      "note-conversation-cleared",
    ])
    expect(effectsOfEvent(CLEARED, true, WORK_MODE, "s1")).toEqual([
      { kind: "note-conversation-cleared" },
    ])
  })

  it("ほかのイベントは何もしない", () => {
    expect(effectsOfEvent({ kind: "session-ended", reason: "x" }, true, CHAT_MODE, "s1")).toEqual(
      [],
    )
  })
})
