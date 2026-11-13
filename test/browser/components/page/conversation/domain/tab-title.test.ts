import { describe, expect, it } from "vitest"

import { tabTitleOf } from "../../../../../../src/browser/components/page/conversation/domain/tab-title.ts"
import type { ReportJudgment } from "../../../../../../src/shared/report/report-progress-field.ts"
import type { SessionEvent } from "../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../../../../fixture/report-event.ts"
import { requestEvent } from "../../../../../fixture/session-event.ts"

function fold(...events: readonly SessionEvent[]): SessionState {
  return events.reduce((state, event) => applySessionEvent(state, event, 0), INITIAL_SESSION_STATE)
}

const CHAT = { kind: "chat-mode-changed", chat: true } as const satisfies SessionEvent
const REQUEST = requestEvent()
const COMPLETED = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent
const INTERRUPTED = {
  kind: "turn-finished",
  outcome: { kind: "interrupted" },
} as const satisfies SessionEvent
const FAILED = {
  kind: "turn-finished",
  outcome: { kind: "failed", cause: { kind: "max-turns" } },
} as const satisfies SessionEvent
const PERMISSION = {
  kind: "pending-changed",
  pending: [{ kind: "permission", id: "ask-1", toolName: "Read", input: {} }],
} as const satisfies SessionEvent

function verdict(judgment: ReportJudgment): SessionEvent {
  return reportEvent({ verdict: judgment, verdictWritten: true })
}

describe("tabTitleOf", () => {
  it.each([
    ["始め方の一覧", [], "tsukumo"],
    ["働いている", [REQUEST], "◐ 働いている ― tsukumo"],
    ["答え待ち", [REQUEST, PERMISSION], "● あなたの番 ― tsukumo"],
    ["report の無い完了", [REQUEST, COMPLETED], "✓ 済んだ ― tsukumo"],
    ["判定 done", [REQUEST, verdict("done"), COMPLETED], "✓ 済んだ ― tsukumo"],
    ["判定 partial", [REQUEST, verdict("partial"), COMPLETED], "◐ 一部済んだ ― tsukumo"],
    ["判定 yours", [REQUEST, verdict("yours"), COMPLETED], "● あなたの番 ― tsukumo"],
    ["判定 stopped", [REQUEST, verdict("stopped"), COMPLETED], "■ 止めた ― tsukumo"],
    ["判定 failed", [REQUEST, verdict("failed"), COMPLETED], "✕ 止まった ― tsukumo"],
    ["report の無い中断", [REQUEST, INTERRUPTED], "■ 止めた ― tsukumo"],
    ["判定 done のあとの中断", [REQUEST, verdict("done"), INTERRUPTED], "■ 止めた ― tsukumo"],
    ["ターンの失敗", [REQUEST, FAILED], "✕ 止まった ― tsukumo"],
    [
      "セッションの終わり",
      [REQUEST, { kind: "session-ended", reason: "架空" }],
      "✕ 止まった ― tsukumo",
    ],
    [
      "前の依頼の判定は持ち越さない",
      [REQUEST, verdict("failed"), COMPLETED, REQUEST, COMPLETED],
      "✓ 済んだ ― tsukumo",
    ],
    ["雑談モードの働いている", [CHAT, REQUEST], "tsukumo"],
    ["雑談モードの完了", [CHAT, REQUEST, COMPLETED], "tsukumo"],
    ["雑談モードの答え待ち", [CHAT, REQUEST, PERMISSION], "● あなたの番 ― tsukumo"],
  ] satisfies readonly (readonly [string, readonly SessionEvent[], string])[])(
    "%s",
    (_name, events, expected) => {
      expect(tabTitleOf(fold(...events), "tsukumo")).toBe(expected)
    },
  )
})
