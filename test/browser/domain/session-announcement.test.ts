import { describe, expect, it } from "vitest"

import { announcementsBetween } from "../../../src/browser/domain/session-announcement.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"

function fold(from: SessionState, ...events: readonly SessionEvent[]): SessionState {
  return events.reduce((state, event) => applySessionEvent(state, event, 0), from)
}

const REQUEST = { kind: "request", text: "架空の依頼", images: [] } as const satisfies SessionEvent
const FINISH = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent
const PERMISSION = {
  kind: "pending-changed",
  pending: [{ kind: "permission", id: "ask-1", toolName: "Read", input: {} }],
} as const satisfies SessionEvent
const NO_PENDING = { kind: "pending-changed", pending: [] } as const satisfies SessionEvent

describe("announcementsBetween", () => {
  it("送ると「作業を始めた」、閉じると「レポートが届いた」", () => {
    const idle = INITIAL_SESSION_STATE
    const working = fold(idle, REQUEST)
    expect(announcementsBetween(idle, working)).toEqual(["作業を始めた"])
    expect(announcementsBetween(working, fold(working, FINISH))).toEqual(["レポートが届いた"])
  })

  it("答え待ちが来たときだけ「お伺いが届いた」を読み、答えて作業へ戻るときは読まない", () => {
    const working = fold(INITIAL_SESSION_STATE, REQUEST)
    const asking = fold(working, PERMISSION)
    expect(announcementsBetween(working, asking)).toEqual(["お伺いが届いた"])
    expect(announcementsBetween(asking, fold(asking, NO_PENDING))).toEqual([])
  })

  it("失敗で終わったときは「失敗で終わった」", () => {
    const working = fold(INITIAL_SESSION_STATE, REQUEST)
    const failed = fold(working, {
      kind: "turn-finished",
      outcome: { kind: "failed", cause: { kind: "max-turns" } },
    })
    expect(announcementsBetween(working, failed)).toEqual(["失敗で終わった"])
  })

  it("閉じたあとに続きのターンが始まると「続きを作業中」", () => {
    const finished = fold(INITIAL_SESSION_STATE, REQUEST, FINISH)
    expect(announcementsBetween(finished, fold(finished, { kind: "turn-resumed" }))).toEqual([
      "続きを作業中",
    ])
  })

  it("新しいセリフを局面の語より先に、1回ずつ読む", () => {
    const working = fold(INITIAL_SESSION_STATE, REQUEST)
    const next = fold(
      working,
      { kind: "speech", text: "架空のセリフ", expression: "default" },
      FINISH,
    )
    expect(announcementsBetween(working, next)).toEqual(["架空のセリフ", "レポートが届いた"])
    expect(announcementsBetween(next, next)).toEqual([])
  })

  it("雑談モードでは局面の語を読まず、セリフだけ読む", () => {
    const chat = fold(INITIAL_SESSION_STATE, { kind: "chat-mode-changed", chat: true })
    const next = fold(
      chat,
      REQUEST,
      { kind: "speech", text: "架空の返事", expression: "default" },
      FINISH,
    )
    expect(announcementsBetween(chat, next)).toEqual(["架空の返事"])
  })

  it("記録が縮んだ（会話が消えた）ときは何も読まない", () => {
    const spoken = fold(INITIAL_SESSION_STATE, REQUEST, {
      kind: "speech",
      text: "架空のセリフ",
      expression: "default",
    })
    expect(announcementsBetween(spoken, fold(spoken, { kind: "conversation-cleared" }))).toEqual([])
  })
})
