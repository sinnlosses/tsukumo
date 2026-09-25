import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { useUsageReview } from "../../../../../src/browser/components/page/token-usage/hooks/use-usage-review.ts"
import {
  SessionStoreContext,
  type SessionStore,
} from "../../../../../src/browser/stores/session.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session-state.ts"
import {
  USAGE_REVIEW_REQUEST_TEXT,
  type UsageProposal,
  type UsageReviewFindings,
} from "../../../../../src/shared/usage-review.ts"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { type CommandSpy, type SentCommand, sessionStoreWith } from "../../../session-store.ts"

/**
 * 画面（`token-usage-screen.tsx`）を丸ごと描かずに、区画のロジックだけを測る
 * （docs/design.md 2章「機能の中を分ける」）。フィクスチャはすべて手で書いた架空の値
 * （`docs/coding-standards.md`「会話内容の扱い」— 実物の会話・記録は使わない）。
 */

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

const FIXTURE_SUMMARY = {
  trend: { unit: "day", points: [] },
  byModel: [
    { model: "架空モデルA", totals: usageTotals(100, 200, 3_000_000) },
    { model: "架空モデルB", totals: usageTotals(10, 20, 1_000_000) },
  ],
  byTool: [
    { name: "ツールA", calls: 1, resultBytes: 10 },
    { name: "ツールB", calls: 2, resultBytes: 20 },
  ],
}

function usageTotals(inputTokens: number, outputTokens: number, cacheReadInputTokens: number) {
  return {
    inputTokens,
    outputTokens,
    thinkingTokens: 0,
    cacheReadInputTokens,
    cacheCreationInputTokens: 0,
    costUsd: 0,
  }
}

function stubSummaryFetch(): void {
  fetchStub = stubRpcFetch(() => rpcOutput(FIXTURE_SUMMARY))
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper(
  store: SessionStore,
  client: QueryClient,
): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <SessionStoreContext.Provider value={store}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </SessionStoreContext.Provider>
    )
  }
}

function stateWith(patch: Partial<SessionState>): SessionState {
  return { ...INITIAL_SESSION_STATE, ...patch }
}

function renderUsageReview(
  state: SessionState,
  spy: CommandSpy = () => {},
): ReturnType<typeof renderHook<ReturnType<typeof useUsageReview>, unknown>> {
  stubSummaryFetch()
  return renderHook(() => useUsageReview(), {
    wrapper: wrapper(sessionStoreWith(state, spy), newClient()),
  })
}

describe("useUsageReview（ふだん）", () => {
  it("押せる状態では start.kind が available", () => {
    const { result } = renderUsageReview(stateWith({}))

    expect(result.current.kind).toBe("idle")
    expect(result.current.kind === "idle" && result.current.start).toEqual({ kind: "available" })
  })

  it("雑談中は押せず、理由に「雑談」を含む", () => {
    const { result } = renderUsageReview(stateWith({ chatMode: true }))

    expect(result.current.kind === "idle" && result.current.start.kind).toBe("blocked")
    expect(
      result.current.kind === "idle" && result.current.start.kind === "blocked"
        ? result.current.start.reason
        : "",
    ).toContain("雑談")
  })

  it("ターンが進行中なら押せず、理由に「ターン」を含む", () => {
    const state = stateWith({ turn: { kind: "running", startedAt: 0 } })
    const { result } = renderUsageReview(state)

    expect(result.current.kind === "idle" && result.current.start.kind).toBe("blocked")
    expect(
      result.current.kind === "idle" && result.current.start.kind === "blocked"
        ? result.current.start.reason
        : "",
    ).toContain("ターン")
  })

  it("雑談中かつターンが進行中でも、理由は1つだけ（雑談を優先）", () => {
    const state = stateWith({ chatMode: true, turn: { kind: "running", startedAt: 0 } })
    const { result } = renderUsageReview(state)

    expect(
      result.current.kind === "idle" && result.current.start.kind === "blocked"
        ? result.current.start.reason
        : "",
    ).toContain("雑談")
  })

  it("前回の提案が無ければ previousReview は none", () => {
    const { result } = renderUsageReview(stateWith({}))

    expect(result.current.kind === "idle" && result.current.previousReview).toEqual({
      kind: "none",
    })
  })

  it("前回の提案があれば MM-DD の日付ラベルを返す", () => {
    const state = stateWith({
      previousUsageReview: {
        kind: "found",
        reviewedAt: 1_700_000_000_000,
        findings: { days: 7, headline: "", proposals: [] },
      },
    })
    const { result } = renderUsageReview(state)

    const previousReview =
      result.current.kind === "idle" ? result.current.previousReview : undefined
    expect(previousReview?.kind).toBe("found")
    expect(previousReview?.kind === "found" ? previousReview.dateLabel : "").toMatch(
      /^\d{2}-\d{2}$/,
    )
  })

  it("押すと USAGE_REVIEW_REQUEST_TEXT を1回だけ会話へ送る", () => {
    const sent: unknown[] = []
    const { result } = renderUsageReview(stateWith({}), (command) => sent.push(command))

    expect(result.current.kind).toBe("idle")
    if (result.current.kind === "idle") {
      result.current.onStart()
    }

    expect(sent).toEqual([
      { procedure: "session.prompt", text: USAGE_REVIEW_REQUEST_TEXT, images: [] },
    ])
  })
})

describe("useUsageReview（見直し中）", () => {
  it("段は並びどおりに done / running / pending に分かれる", () => {
    const state = stateWith({
      usageReview: { kind: "running", startedAt: 0, days: 7, stage: "tool" },
    })
    const { result } = renderUsageReview(state)

    expect(result.current.kind).toBe("running")
    const stages = result.current.kind === "running" ? result.current.stages : []
    expect(stages.map((stage) => stage.stage)).toEqual([
      "model",
      "cache",
      "tool",
      "context",
      "proposal",
    ])
    expect(stages.map((stage) => stage.status)).toEqual([
      "done",
      "done",
      "running",
      "pending",
      "pending",
    ])
  })

  it("モデル・キャッシュ・ツールの3段だけ、集計から数を引く", async () => {
    const state = stateWith({
      usageReview: { kind: "running", startedAt: 0, days: 7, stage: "tool" },
    })
    const { result } = renderUsageReview(state)

    await waitFor(() => {
      const stages = result.current.kind === "running" ? result.current.stages : []
      expect(stages[0]?.count).toEqual({ kind: "shown", label: "2 モデル" })
    })
    const stages = result.current.kind === "running" ? result.current.stages : []
    expect(stages[1]?.count).toEqual({ kind: "shown", label: "読み 4.00M" })
    expect(stages[2]?.count).toEqual({ kind: "shown", label: "2 種類" })
    expect(stages[3]?.count).toEqual({ kind: "none" })
    expect(stages[4]?.count).toEqual({ kind: "none" })
  })

  it("見直しの期間が1/7/30以外なら、数を出さない", () => {
    const state = stateWith({
      usageReview: { kind: "running", startedAt: 0, days: 3, stage: "model" },
    })
    const { result } = renderUsageReview(state)

    const stages = result.current.kind === "running" ? result.current.stages : []
    expect(stages.every((stage) => stage.count.kind === "none")).toBe(true)
  })

  it("直近のセリフは speeches の最後の1件、無ければ none", () => {
    const running = { kind: "running" as const, startedAt: 0, days: 7, stage: "model" as const }

    const withSpeech = renderUsageReview(
      stateWith({ usageReview: running, speeches: ["ひとつめ", "ふたつめ"] }),
    )
    expect(
      withSpeech.result.current.kind === "running" ? withSpeech.result.current.speech : undefined,
    ).toEqual({ kind: "said", text: "ふたつめ" })

    const withoutSpeech = renderUsageReview(stateWith({ usageReview: running, speeches: [] }))
    expect(
      withoutSpeech.result.current.kind === "running"
        ? withoutSpeech.result.current.speech
        : undefined,
    ).toEqual({ kind: "none" })
  })

  it("「止める」は interrupt を1回だけ送る", () => {
    const sent: unknown[] = []
    const state = stateWith({
      usageReview: { kind: "running", startedAt: 0, days: 7, stage: "model" },
    })
    const { result } = renderUsageReview(state, (command) => sent.push(command))

    if (result.current.kind === "running") {
      result.current.onInterrupt()
    }

    expect(sent).toEqual([{ procedure: "session.interrupt" }])
  })
})

const FIXTURE_PROPOSAL: UsageProposal = {
  kind: "tool-result",
  target: "架空ツール",
  impact: "large",
  title: "架空の提案",
  basis: "架空の根拠。",
  action: "架空のやること。",
  followUp: "delegate",
}

const FIXTURE_FINDINGS: UsageReviewFindings = {
  days: 7,
  headline: "架空の一言。",
  proposals: [FIXTURE_PROPOSAL],
}

describe("useUsageReview（結果）", () => {
  it("結果の場面には reviewedAtLabel・periodLabel・headline・提案が並ぶ", () => {
    const state = stateWith({
      usageReview: { kind: "result", reviewedAt: 1_700_000_000_000, findings: FIXTURE_FINDINGS },
    })
    const { result } = renderUsageReview(state)

    expect(result.current.kind).toBe("result")
    if (result.current.kind === "result") {
      expect(result.current.periodLabel).toBe("直近 7 日")
      expect(result.current.headline).toBe("架空の一言。")
      expect(result.current.reviewedAtLabel).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
      expect(result.current.proposals).toHaveLength(1)
      expect(result.current.proposals[0]?.title).toBe("架空の提案")
      expect(result.current.close).toEqual({ kind: "none" })
    }
  })

  it("1日の見直しは periodLabel が「今日」になる", () => {
    const state = stateWith({
      usageReview: {
        kind: "result",
        reviewedAt: 0,
        findings: { ...FIXTURE_FINDINGS, days: 1 },
      },
    })
    const { result } = renderUsageReview(state)

    expect(result.current.kind === "result" ? result.current.periodLabel : "").toBe("今日")
  })

  it("主ボタンは会話へ依頼を1回送る", () => {
    const sent: SentCommand[] = []
    const state = stateWith({
      usageReview: { kind: "result", reviewedAt: 0, findings: FIXTURE_FINDINGS },
    })
    const { result } = renderUsageReview(state, (command) => sent.push(command))

    if (result.current.kind === "result") {
      result.current.proposals[0]?.onPrimary()
    }

    expect(sent).toHaveLength(1)
    expect(sent[0]?.procedure).toBe("session.prompt")
    expect(sent[0]?.["text"]).toEqual(expect.stringContaining("架空の提案"))
  })

  it("見送るは種類と対象を添えて usageReview.dismissProposal を1回送る", () => {
    const sent: unknown[] = []
    const state = stateWith({
      usageReview: { kind: "result", reviewedAt: 0, findings: FIXTURE_FINDINGS },
    })
    const { result } = renderUsageReview(state, (command) => sent.push(command))

    if (result.current.kind === "result") {
      result.current.proposals[0]?.onDismiss()
    }

    expect(sent).toEqual([
      { procedure: "usageReview.dismissProposal", kind: "tool-result", target: "架空ツール" },
    ])
  })

  it("もう一度見てもらうは USAGE_REVIEW_REQUEST_TEXT を送る", () => {
    const sent: unknown[] = []
    const state = stateWith({
      usageReview: { kind: "result", reviewedAt: 0, findings: FIXTURE_FINDINGS },
    })
    const { result } = renderUsageReview(state, (command) => sent.push(command))

    if (result.current.kind === "result") {
      result.current.onRetry()
    }

    expect(sent).toEqual([
      { procedure: "session.prompt", text: USAGE_REVIEW_REQUEST_TEXT, images: [] },
    ])
  })

  it("ターンが進行中は retry が blocked になる", () => {
    const state = stateWith({
      usageReview: { kind: "result", reviewedAt: 0, findings: FIXTURE_FINDINGS },
      turn: { kind: "running", startedAt: 0 },
    })
    const { result } = renderUsageReview(state)

    expect(result.current.kind === "result" ? result.current.retry.kind : "").toBe("blocked")
  })
})

describe("useUsageReview（前回の提案を開く）", () => {
  it("「前回の提案」を開くと同じ形の結果が出て、close が shown になる", () => {
    const state = stateWith({
      previousUsageReview: { kind: "found", reviewedAt: 0, findings: FIXTURE_FINDINGS },
    })
    const { result } = renderUsageReview(state)

    expect(result.current.kind).toBe("idle")
    act(() => {
      if (result.current.kind === "idle" && result.current.previousReview.kind === "found") {
        result.current.previousReview.onOpen()
      }
    })

    expect(result.current.kind).toBe("result")
    if (result.current.kind === "result") {
      expect(result.current.headline).toBe("架空の一言。")
      expect(result.current.close.kind).toBe("shown")
    }
  })

  it("閉じるを押すと前回の提案の表示をやめ、idle へ戻る", () => {
    const state = stateWith({
      previousUsageReview: { kind: "found", reviewedAt: 0, findings: FIXTURE_FINDINGS },
    })
    const { result } = renderUsageReview(state)

    act(() => {
      if (result.current.kind === "idle" && result.current.previousReview.kind === "found") {
        result.current.previousReview.onOpen()
      }
    })
    act(() => {
      if (result.current.kind === "result" && result.current.close.kind === "shown") {
        result.current.close.onClose()
      }
    })

    expect(result.current.kind).toBe("idle")
  })
})
