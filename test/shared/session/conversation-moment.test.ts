import { describe, expect, it } from "vitest"

import {
  type ConversationMoment,
  conversationMoment,
} from "../../../src/shared/session/conversation-moment.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { detailRecord, requestRecord, speechRecord } from "../../fixture/session-record.ts"

const REQUESTED: SessionState = { ...INITIAL_SESSION_STATE, records: [requestRecord()] }

const RUNNING = { kind: "running", startedAt: 0 } as const satisfies SessionState["turn"]

const ENDED = {
  kind: "finished",
  startedAt: 0,
  finishedAt: 100,
  ending: { kind: "ended" },
} as const satisfies SessionState["turn"]

const FAILED = {
  kind: "finished",
  startedAt: 0,
  finishedAt: 100,
  ending: { kind: "failed", failure: { kind: "api-error", error: "server_error" } },
} as const satisfies SessionState["turn"]

describe("conversationMoment", () => {
  it.each<[string, SessionState, ConversationMoment]>([
    ["依頼が1件も無い", INITIAL_SESSION_STATE, "greet"],
    ["依頼のあと動いている", { ...REQUESTED, turn: RUNNING }, "work"],
    [
      "動いていて答え待ちがある",
      {
        ...REQUESTED,
        turn: RUNNING,
        pending: [{ kind: "permission", id: "p1", toolName: "Bash", input: {}, askedAt: 0 }],
      },
      "ask",
    ],
    ["終わって背景のタスクも無い", { ...REQUESTED, turn: ENDED }, "deliver"],
    ["失敗で終わった", { ...REQUESTED, turn: FAILED }, "stumble"],
    ["セッションが終わった", { ...REQUESTED, turn: ENDED, endedReason: "架空の理由" }, "stumble"],
    [
      "ターンは終わったが背景のタスクが残っている",
      {
        ...REQUESTED,
        turn: ENDED,
        backgroundTasks: [{ taskId: "t1", kind: "shell", description: "架空の背景" }],
      },
      "work",
    ],
    ["/clear で記録が空になった", { ...INITIAL_SESSION_STATE, turn: ENDED }, "greet"],
    [
      "依頼より前のセリフだけがある",
      { ...INITIAL_SESSION_STATE, records: [speechRecord()] },
      "greet",
    ],
    [
      "依頼より前の本文がある（途中から追い始めた）",
      { ...INITIAL_SESSION_STATE, records: [detailRecord()] },
      "deliver",
    ],
  ])("%s", (_label, state, expected) => {
    expect(conversationMoment(state)).toBe(expected)
  })
})
