import { afterEach, describe, expect, it, vi } from "vitest"

import {
  turnFailureBlockOf,
  type TurnFailureBlockSource,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/turn-failure-block.ts"
import { API_ERROR_KINDS } from "../../../../../../../../src/shared/session-driver/api-trouble.ts"

const NOW = Temporal.ZonedDateTime.from("2026-09-24T12:00:00[UTC]")

afterEach(() => {
  vi.restoreAllMocks()
})

function source(overrides: Partial<TurnFailureBlockSource>): TurnFailureBlockSource {
  return {
    ending: { kind: "failed", failure: { kind: "api-error", error: "server_error" } },
    remains: {},
    requestText: "架空の依頼",
    rateLimit: { kind: "clear" },
    newest: true,
    hasFailedStep: false,
    hasSteps: false,
    now: NOW.epochMilliseconds,
    ...overrides,
  }
}

describe("turnFailureBlockOf", () => {
  it.each(API_ERROR_KINDS)(
    "理由の語に内部の綴りを出さず、title の全文にだけ出す（%s）",
    (error) => {
      const block = turnFailureBlockOf(
        source({ ending: { kind: "failed", failure: { kind: "api-error", error } } }),
      )

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
        ending: { kind: "failed", failure: { kind: "api-error", error: "rate_limit" } },
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

  it("失敗の詳細は、title に置く全文（detail）として持つ", () => {
    expect(turnFailureBlockOf(source({})).detail).toBe(
      "失敗で終わった: API のサーバが応えなかった（server_error）",
    )
  })

  it("残ったものは、導けた項目だけを行にする", () => {
    expect(
      turnFailureBlockOf(
        source({
          remains: {
            phases: { done: 2, total: 5, stopped: "段C" },
            files: { count: 3, first: "a.ts" },
          },
        }),
      ).remains,
    ).toBe("残ったもの　済んだフェーズ 2/5・書き換えた 3 ファイル（a.ts ほか）")
    expect(turnFailureBlockOf(source({})).remains).toBe("")
  })

  it("中断は「止めた」と止めた段・続きを頼む文・手順を見る口を持ち、送らない口だけにする", () => {
    const block = turnFailureBlockOf(
      source({
        ending: { kind: "interrupted" },
        remains: {
          phases: { done: 1, total: 4, stopped: "段B" },
          files: { count: 1, first: "a.ts" },
        },
        hasSteps: true,
      }),
    )

    expect(block.heading).toBe("止めた")
    expect(block.reason).toBe("フェーズ 2/4「段B」の途中で止めた")
    expect(block.detail).toBe("")
    expect(block.remains).toBe("残ったもの　済んだフェーズ 1/4・書き換えた 1 ファイル（a.ts）")
    expect(block.retry).toEqual({
      kind: "request",
      label: "続きを頼む文を入力欄に入れる",
      request: "続きをお願いします。",
    })
    expect(block.failedSteps).toEqual({ kind: "shown", label: "手順を見る" })
  })

  it("失敗した手順を見る口は、いちばん新しいやり取りで失敗した手順があるときだけ出す", () => {
    expect(turnFailureBlockOf(source({ hasFailedStep: true })).failedSteps.kind).toBe("shown")
    expect(turnFailureBlockOf(source({ hasFailedStep: false })).failedSteps.kind).toBe("none")
    expect(
      turnFailureBlockOf(source({ hasFailedStep: true, newest: false })).failedSteps.kind,
    ).toBe("none")
  })
})
