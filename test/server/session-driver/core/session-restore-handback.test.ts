import { describe, expect, it } from "vitest"

import { EMPTY_INPUT_LEDGER } from "../../../../src/server/session-driver/core/input-ledger.ts"
import { toRestoredEvents } from "../../../../src/server/session-driver/core/session-restore.ts"
import { applyRestoredEvents } from "../../../../src/server/session/core/restored-event.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"
import {
  assistantMessage,
  userMessage,
  WORK_PLAN_TOOL_FULL_NAME,
} from "../../../fixture/sdk-message.ts"
import { requestEvent } from "../../../fixture/session-event.ts"
import { eventsOf, stamped } from "../../../fixture/session-restore.ts"

describe("toRestoredEvents（委譲の返却）", () => {
  // transcript の返却は is_meta の user メッセージで、origin.body は字下げの無い前置きの行のあとに返却の各行が2字下げで入る
  function handbackMessage(returnLines: readonly string[], timestamp?: string): unknown {
    const body = ["架空の前置き", ...returnLines.map((line) => `  ${line}`)].join("\n")
    const message = Object.assign({}, userMessage(`<agent-message>\n${body}\n</agent-message>`), {
      is_meta: true,
      origin: { kind: "peer", from: "架空のID", handback: true, body },
    })
    return timestamp === undefined ? message : stamped(message, timestamp)
  }

  it("返却は本文が何であっても、依頼にもイベントにもしない", () => {
    const messages = [
      userMessage("架空の依頼"),
      handbackMessage(["計画 0/2 | 架空の計画。"]),
      handbackMessage(["段 1/2 | 架空の要約。"]),
      handbackMessage(["止めた 2/2 | 架空の理由"]),
      handbackMessage(["了解しました"]),
    ]

    expect(eventsOf(messages)).toEqual([
      requestEvent(),
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])
  })

  it("返却のあとに残るフックの注記の添付は、依頼にも2つ目の返却にもしない", () => {
    const note = {
      type: "attachment",
      attachment: {
        type: "hook_additional_context",
        content: ["tsukumo の注記（委譲先の返却の本文ではない）:架空の注記。"],
        hookName: "UserPromptSubmit",
        hookEvent: "UserPromptSubmit",
      },
    }

    expect(
      eventsOf([userMessage("架空の依頼"), handbackMessage(["段 1/2 | 架空の要約。"]), note]).map(
        ({ kind }) => kind,
      ),
    ).toEqual(["request", "turn-finished"])
  })

  it("handback の印の無い伝言と、本文の読めない返却の扱い", () => {
    const notHandback = Object.assign({}, handbackMessage(["段 1/2 | 架空"]), {
      origin: { kind: "peer", from: "架空のID", body: "x\n  段 1/2 | 架空" },
    })
    const noBody = Object.assign({}, handbackMessage([]), {
      origin: { kind: "peer", from: "架空のID", handback: true },
    })

    expect(
      eventsOf([userMessage("架空の依頼"), notHandback, noBody]).map(({ kind }) => kind),
    ).toEqual(["request", "turn-finished"])
  })

  it("返却は帯を動かさず、組み直した帯はメインの work_plan が決めた位置になる", () => {
    const phases = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
    const workPlan = (id: string, input: unknown, timestamp: string) => [
      stamped(
        assistantMessage([{ type: "tool_use", id, name: WORK_PLAN_TOOL_FULL_NAME, input }]),
        timestamp,
      ),
      stamped(userMessage([{ type: "tool_result", tool_use_id: id, content: "ok" }]), timestamp),
    ]
    const messages = [
      stamped(userMessage("架空の依頼"), "2026-01-02T03:00:00.000Z"),
      ...workPlan("w-1", { phases, current: 0 }, "2026-01-02T03:01:00.000Z"),
      ...workPlan(
        "w-2",
        {
          phases,
          current: 1,
          phaseSummary: "架空の計画だった。",
          delegatedRange: { first: 1, count: 2 },
        },
        "2026-01-02T03:02:00.000Z",
      ),
      handbackMessage(["段 1/2 | 架空の1つ目。"], "2026-01-02T03:10:00.000Z"),
      handbackMessage(["段 2/2 | 架空の2つ目。"], "2026-01-02T03:20:00.000Z"),
    ]

    const state = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      toRestoredEvents(messages, EXPRESSIONS, EMPTY_INPUT_LEDGER),
      999,
    )
    const plans = state.records.filter((record) => record.kind === "work-plan")

    expect(plans.map((record) => record.current)).toEqual([0, 1])
  })
})
