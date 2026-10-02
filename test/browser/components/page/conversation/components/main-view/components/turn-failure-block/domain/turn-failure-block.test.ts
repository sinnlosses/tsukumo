import { afterEach, describe, expect, it, vi } from "vitest"

import {
  turnFailureBlockOf,
  type TurnFailureBlockSource,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/turn-failure-block/domain/turn-failure-block.ts"
import { API_ERROR_KINDS } from "../../../../../../../../../../src/shared/session-driver/api-trouble.ts"

const NOW = Temporal.ZonedDateTime.from("2026-09-24T12:00:00[UTC]")

afterEach(() => {
  vi.restoreAllMocks()
})

function source(overrides: Partial<TurnFailureBlockSource>): TurnFailureBlockSource {
  return {
    failure: { kind: "api-error", error: "server_error" },
    requestText: "架空の依頼",
    rateLimit: { kind: "clear" },
    newest: true,
    hasFailedStep: false,
    now: NOW.epochMilliseconds,
    ...overrides,
  }
}

describe("turnFailureBlockOf", () => {
  it.each(API_ERROR_KINDS)(
    "理由の語に内部の綴りを出さず、title の全文にだけ出す（%s）",
    (error) => {
      const block = turnFailureBlockOf(source({ failure: { kind: "api-error", error } }))

      expect(block.reason).not.toContain(error)
      expect(block.detail).toContain(`（${error}）`)
    },
  )

  it("依頼の文があれば、同じ依頼を入力欄に戻す口を出す", () => {
    expect(turnFailureBlockOf(source({})).retry).toEqual({
      kind: "request",
      label: "同じ依頼を入力欄に戻す",
      request: "架空の依頼",
    })
  })

  it("依頼の文が無ければ、戻す口を出さない", () => {
    expect(turnFailureBlockOf(source({ requestText: "" })).retry).toEqual({ kind: "none" })
  })

  it("いちばん新しいやり取りで利用上限に達していれば、戻る時刻を口の字に添える", () => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("UTC")
    const block = turnFailureBlockOf(
      source({
        failure: { kind: "api-error", error: "rate_limit" },
        rateLimit: {
          kind: "rejected",
          bucket: "five-hour",
          resetsAt: NOW.add({ hours: 6 }).epochMilliseconds,
        },
      }),
    )

    expect(block.retry).toEqual({
      kind: "after-reset",
      label: "18:00に戻る · 依頼を入力欄に戻す",
      request: "架空の依頼",
    })
  })

  it("戻る時刻が分からない・過去のやり取りなら、ふつうの戻す口にする", () => {
    const rejected = { kind: "rejected", bucket: "five-hour", resetsAt: undefined } as const

    expect(turnFailureBlockOf(source({ rateLimit: rejected })).retry.kind).toBe("request")
    expect(
      turnFailureBlockOf(
        source({
          newest: false,
          rateLimit: { ...rejected, resetsAt: NOW.add({ hours: 6 }).epochMilliseconds },
        }),
      ).retry.kind,
    ).toBe("request")
  })

  it("失敗した手順を見る口は、いちばん新しいやり取りで失敗した手順があるときだけ出す", () => {
    expect(turnFailureBlockOf(source({ hasFailedStep: true })).failedSteps.kind).toBe("shown")
    expect(turnFailureBlockOf(source({ hasFailedStep: false })).failedSteps.kind).toBe("none")
    expect(
      turnFailureBlockOf(source({ hasFailedStep: true, newest: false })).failedSteps.kind,
    ).toBe("none")
  })
})
