import { describe, expect, it } from "vitest"

import { alertEventsBetween } from "../../../../../../src/browser/components/page/conversation/domain/alert-event.ts"
import type { ReportJudgment } from "../../../../../../src/shared/report/report-progress-field.ts"
import type { SessionEvent } from "../../../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../../../../fixture/report-event.ts"
import { requestEvent } from "../../../../../fixture/session-event.ts"

function fold(from: SessionState, ...events: readonly SessionEvent[]): SessionState {
  return events.reduce((state, event) => applySessionEvent(state, event, 0), from)
}

const REQUEST_TEXT = "架空の依頼の字"
const REPORT_TEXT = "架空のレポートの結論"
const working = fold(INITIAL_SESSION_STATE, requestEvent(REQUEST_TEXT))
const COMPLETED = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
} as const satisfies SessionEvent
const PERMISSION = {
  kind: "pending-changed",
  pending: [{ kind: "permission", id: "ask-1", toolName: "Read", input: {} }],
} as const satisfies SessionEvent
const QUESTION = {
  kind: "pending-changed",
  pending: [
    {
      kind: "question",
      id: "ask-2",
      questions: [],
      briefs: [],
      imageSizes: [],
      unshelvedImages: [],
    },
  ],
} as const satisfies SessionEvent

function closedWith(judgment: ReportJudgment): SessionState {
  return fold(
    working,
    reportEvent({ verdict: judgment, verdictWritten: true, conclusion: REPORT_TEXT }),
    COMPLETED,
  )
}

function kindsOf(previous: SessionState, next: SessionState): readonly string[] {
  return alertEventsBetween(previous, next).map((event) => event.kind)
}

describe("alertEventsBetween", () => {
  it.each([
    ["done", ["finished"]],
    ["partial", ["finished"]],
    ["yours", ["question"]],
    ["failed", ["failure"]],
    ["stopped", []],
  ] satisfies readonly (readonly [ReportJudgment, readonly string[]])[])(
    "判定 %s で閉じると %j",
    (judgment, expected) => {
      expect(kindsOf(working, closedWith(judgment))).toEqual(expected)
    },
  )

  it("許可と質問の答え待ちは、それぞれの種類で返す", () => {
    expect(kindsOf(working, fold(working, PERMISSION))).toEqual(["permission"])
    expect(kindsOf(working, fold(working, QUESTION))).toEqual(["question"])
  })

  it("同じ id の答え待ちは、続く姿でもう一度返さない", () => {
    const asking = fold(working, PERMISSION)
    expect(
      alertEventsBetween(
        asking,
        fold(asking, { kind: "speech", text: "架空", expression: "default" }),
      ),
    ).toEqual([])
  })

  it("ターンの失敗とセッションの終わりは failure", () => {
    const failed = fold(working, {
      kind: "turn-finished",
      outcome: { kind: "failed", cause: { kind: "max-turns" } },
    })
    expect(kindsOf(working, failed)).toEqual(["failure"])
    expect(kindsOf(working, fold(working, { kind: "session-ended", reason: "架空" }))).toEqual([
      "failure",
    ])
  })

  it("中断で閉じたときは返さない（利用者が止めた）", () => {
    const interrupted = fold(working, { kind: "turn-finished", outcome: { kind: "interrupted" } })
    expect(alertEventsBetween(working, interrupted)).toEqual([])
  })

  it("雑談モードでは答え待ちだけを返す", () => {
    const chat = fold(
      INITIAL_SESSION_STATE,
      { kind: "chat-mode-changed", chat: true },
      requestEvent(),
    )
    expect(kindsOf(chat, fold(chat, COMPLETED))).toEqual([])
    expect(kindsOf(chat, fold(chat, PERMISSION))).toEqual(["permission"])
  })

  it("鍵はターンごとに別で、同じターンの同じ種類は同じ鍵", () => {
    const first = alertEventsBetween(working, closedWith("done"))
    const second = closedWith("done")
    const again = fold(second, requestEvent(), COMPLETED)
    expect(first.map((event) => event.key)).toEqual(
      alertEventsBetween(working, closedWith("done")).map((event) => event.key),
    )
    expect(alertEventsBetween(fold(second, requestEvent()), again)[0]?.key).not.toBe(first[0]?.key)
  })

  it("題と本文に、セリフ・依頼・レポートの字を入れない", () => {
    const events = [
      ...alertEventsBetween(working, fold(working, PERMISSION)),
      ...alertEventsBetween(working, closedWith("done")),
      ...alertEventsBetween(working, closedWith("failed")),
    ]
    for (const event of events) {
      expect(`${event.title}${event.body}`).not.toContain(REQUEST_TEXT)
      expect(`${event.title}${event.body}`).not.toContain(REPORT_TEXT)
    }
  })
})
