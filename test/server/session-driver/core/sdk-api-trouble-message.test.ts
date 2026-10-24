import { describe, expect, it } from "vitest"

import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { assistantMessageWithoutUuid, EXPRESSIONS } from "../../../fixture/sdk-assistant-message.ts"

describe("API の不調と失敗（docs/requirements.md 4.1）", () => {
  it("result の success でも is_error が true なら API のエラーの失敗にする", () => {
    const message = { type: "result", subtype: "success", is_error: true, api_error_status: 529 }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([
      { kind: "turn-finished", outcome: { kind: "failed", cause: { kind: "api-error" } } },
    ])
  })

  it("result の上限の subtype はそれぞれの失敗にし、errors の自由文は運ばない", () => {
    const messages = [
      { type: "result", subtype: "error_max_turns", errors: ["架空のエラー文"] },
      { type: "result", subtype: "error_max_budget_usd", errors: ["架空のエラー文"] },
    ]

    expect(messages.flatMap((message) => toSessionEvents(message, EXPRESSIONS))).toEqual([
      { kind: "turn-finished", outcome: { kind: "failed", cause: { kind: "max-turns" } } },
      { kind: "turn-finished", outcome: { kind: "failed", cause: { kind: "max-budget" } } },
    ])
  })

  it("中断でない理由の error_during_execution と知らない subtype は実行中のエラーの失敗にする", () => {
    const messages = [
      { type: "result", subtype: "error_during_execution", terminal_reason: "model_error" },
      { type: "result", subtype: "error_max_structured_output_retries" },
      { type: "result", subtype: "架空の未知の種別" },
    ]
    const failed = {
      kind: "turn-finished",
      outcome: { kind: "failed", cause: { kind: "execution-error" } },
    } satisfies SessionEvent

    expect(messages.flatMap((message) => toSessionEvents(message, EXPRESSIONS))).toEqual([
      failed,
      failed,
      failed,
    ])
  })

  it("system の api_retry を api-retry にする（null の error_status は undefined に畳む）", () => {
    const messages = [
      {
        type: "system",
        subtype: "api_retry",
        attempt: 2,
        max_retries: 10,
        retry_delay_ms: 4000,
        error_status: 529,
        error: "overloaded",
      },
      {
        type: "system",
        subtype: "api_retry",
        attempt: 1,
        max_retries: 1,
        retry_delay_ms: 500,
        error_status: null,
        error: "架空の未知のエラー",
        no_response: { waited_ms: 30_000, retry_wait_ms: 60_000 },
      },
    ]

    expect(messages.flatMap((message) => toSessionEvents(message, EXPRESSIONS))).toEqual([
      {
        kind: "api-retry",
        retry: {
          attempt: 2,
          maxRetries: 10,
          retryDelayMs: 4000,
          errorStatus: 529,
          error: "overloaded",
        },
      },
      {
        kind: "api-retry",
        retry: {
          attempt: 1,
          maxRetries: 1,
          retryDelayMs: 500,
          errorStatus: undefined,
          error: "unknown",
        },
      },
    ])
  })

  it("回数か待ち時間が数でない api_retry は何も出さない", () => {
    const message = {
      type: "system",
      subtype: "api_retry",
      attempt: "2",
      max_retries: 10,
      retry_delay_ms: 4000,
      error_status: 529,
      error: "overloaded",
    }

    expect(toSessionEvents(message, EXPRESSIONS)).toEqual([])
  })

  it("rate_limit_event を rate-limit-changed にし、戻る時刻は秒からミリ秒に直す", () => {
    const info = (rateLimitInfo: Record<string, unknown>): Record<string, unknown> => ({
      type: "rate_limit_event",
      rate_limit_info: rateLimitInfo,
      session_id: "s-1",
    })
    const messages = [
      info({ status: "allowed_warning", rateLimitType: "five_hour", resetsAt: 1_800_000_000 }),
      info({ status: "rejected", rateLimitType: "seven_day_overage_included", utilization: 1 }),
      info({ status: "rejected", rateLimitType: "架空の枠", resetsAt: 1_800_000_000 }),
      info({ status: "allowed", rateLimitType: "five_hour" }),
    ]

    expect(messages.flatMap((message) => toSessionEvents(message, EXPRESSIONS))).toEqual([
      // 「近い」（allowed_warning）は clear に畳む——枠の残り具合はサイドバーのプラン使用量が出す。
      { kind: "rate-limit-changed", rateLimit: { kind: "clear" } },
      {
        kind: "rate-limit-changed",
        rateLimit: { kind: "rejected", bucket: "seven-day", resetsAt: undefined },
      },
      {
        kind: "rate-limit-changed",
        rateLimit: { kind: "rejected", bucket: "other", resetsAt: 1_800_000_000_000 },
      },
      { kind: "rate-limit-changed", rateLimit: { kind: "clear" } },
    ])
  })

  it("status が分からない・info が無い rate_limit_event は何も出さない", () => {
    const messages = [
      { type: "rate_limit_event", rate_limit_info: { status: "架空の状態" } },
      { type: "rate_limit_event" },
    ]

    expect(messages.flatMap((message) => toSessionEvents(message, EXPRESSIONS))).toEqual([])
  })

  it("メインの assistant の error を api-error にし、ステップの使用量より後ろに並べる", () => {
    const message = {
      ...assistantMessageWithoutUuid([{ type: "text", text: "架空の API エラーの文面" }]),
      message: {
        id: "msg_error",
        role: "assistant",
        content: [{ type: "text", text: "架空の API エラーの文面" }],
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      error: "rate_limit",
    }

    expect(toSessionEvents(message, EXPRESSIONS).map((event) => event.kind)).toEqual([
      "utterance",
      "step-usage",
      "api-error",
    ])
    expect(toSessionEvents(message, EXPRESSIONS).at(-1)).toEqual({
      kind: "api-error",
      error: "rate_limit",
    })
  })

  it("知らない綴りの error は unknown に畳み、サブエージェントの error は捨てる", () => {
    const main = { ...assistantMessageWithoutUuid([]), error: "架空の未知のエラー" }
    const subagent = { ...assistantMessageWithoutUuid([], "toolu_agent"), error: "overloaded" }

    expect(toSessionEvents(main, EXPRESSIONS)).toEqual([{ kind: "api-error", error: "unknown" }])
    expect(toSessionEvents(subagent, EXPRESSIONS)).toEqual([])
  })
})
