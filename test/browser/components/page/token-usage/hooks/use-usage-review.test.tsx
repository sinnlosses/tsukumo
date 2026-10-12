import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useUsageReview } from "../../../../../../src/browser/components/page/token-usage/hooks/use-usage-review.ts"
import type { SessionState } from "../../../../../../src/shared/session/session-state.ts"
import type {
  UsageProposal,
  UsageProposalRun,
  UsageReview,
  UsageReviewFindings,
  UsageReviewStage,
} from "../../../../../../src/shared/usage-review/usage-review.ts"
import { createTestQueryClient, queryClientWrapper } from "../../../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../../rpc-fetch-stub.ts"
import { type CommandSpy, putSession, stateWith } from "../../../../session-store.ts"

/**
 * 画面（`TokenUsage`）を丸ごと描かずに、区画のロジックだけを測る
 * （docs/architecture.md「機能の中を分ける」）。フィクスチャはすべて手で書いた架空の値
 */

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  window.location.hash = ""
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

/** その段に入った見直し中の状態（始まりは 0、セリフはまだ無い）。 */
function runningReview(stage: UsageReviewStage, days: number): UsageReview {
  return {
    kind: "running",
    startedAt: 0,
    progress: { kind: "stage", stage, days },
    speech: { kind: "none" },
  }
}

/** FIXTURE_PROPOSAL（`tool-result:架空ツール`）を頼んでいる最中。 */
const RUNNING_PROPOSAL_RUN: UsageProposalRun = {
  kind: "running",
  key: "tool-result:架空ツール",
  startedAt: 0,
  speech: { kind: "said", text: "架空の実行の声" },
}

function renderUsageReview(
  state: SessionState,
  spy: CommandSpy = () => {},
): ReturnType<typeof renderHook<ReturnType<typeof useUsageReview>, unknown>> {
  stubSummaryFetch()
  putSession(state, spy)
  return renderHook(() => useUsageReview(), {
    wrapper: queryClientWrapper(createTestQueryClient()),
  })
}

describe("useUsageReview（ふだん）", () => {
  it("押せる状態では start.kind が available", () => {
    const { result } = renderUsageReview(stateWith({}))

    expect(result.current.kind).toBe("idle")
    expect(result.current.kind === "idle" && result.current.start).toEqual({ kind: "available" })
  })

  it("雑談中でもターンが進行中でも押せる", () => {
    const { result } = renderUsageReview(
      stateWith({ chatMode: true, turn: { kind: "running", startedAt: 0 } }),
    )

    expect(result.current.kind === "idle" && result.current.start).toEqual({ kind: "available" })
  })

  it("提案の実行が走っている間は押せず、理由が出る", () => {
    const { result } = renderUsageReview(stateWith({ usageProposalRun: RUNNING_PROPOSAL_RUN }))

    expect(result.current.kind === "idle" && result.current.start).toEqual({
      kind: "blocked",
      reason: "いま提案を頼んでいる。終わってからもう一度押す。",
    })
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

  it("押すと usageReview.start を1回だけ送り、会話へは送らない", () => {
    const sent: unknown[] = []
    const { result } = renderUsageReview(
      stateWith({ turn: { kind: "running", startedAt: 0 } }),
      (command) => sent.push(command),
    )

    expect(result.current.kind).toBe("idle")
    if (result.current.kind === "idle") {
      result.current.onStart()
    }

    expect(sent).toEqual([{ procedure: "usageReview.start" }])
  })
})

describe("useUsageReview（見直し中）", () => {
  it("段は並びどおりに done / running / pending に分かれる", () => {
    const state = stateWith({ usageReview: runningReview("tool", 7) })
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

  it("最初の段が届くまでは、見直し中のまま全部の段が未着手", () => {
    const state = stateWith({
      usageReview: {
        kind: "running",
        startedAt: 0,
        progress: { kind: "preparing" },
        speech: { kind: "none" },
      },
    })
    const { result } = renderUsageReview(state)

    const stages = result.current.kind === "running" ? result.current.stages : []
    expect(stages.map((stage) => stage.status)).toEqual(Array(5).fill("pending"))
  })

  it("モデル・キャッシュ・ツールの3段だけ、集計から数を引く", async () => {
    const state = stateWith({ usageReview: runningReview("tool", 7) })
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
    const state = stateWith({ usageReview: runningReview("model", 3) })
    const { result } = renderUsageReview(state)

    const stages = result.current.kind === "running" ? result.current.stages : []
    expect(stages.every((stage) => stage.count.kind === "none")).toBe(true)
  })

  it("直近のセリフは会話の吹き出しではなく、見直しのセリフから引く", () => {
    const { result } = renderUsageReview(
      stateWith({
        usageReview: {
          kind: "running",
          startedAt: 0,
          progress: { kind: "stage", stage: "model", days: 7 },
          speech: { kind: "said", text: "見直しの声" },
        },
        speeches: [{ text: "会話の声", expression: "default", time: { kind: "stamped", at: 0 } }],
      }),
    )

    expect(result.current.kind === "running" ? result.current.speech : undefined).toEqual({
      kind: "said",
      text: "見直しの声",
    })
  })

  it("「止める」は usageReview.interrupt を1回だけ送り、会話は止めない", () => {
    const sent: unknown[] = []
    const state = stateWith({ usageReview: runningReview("model", 7) })
    const { result } = renderUsageReview(state, (command) => sent.push(command))

    if (result.current.kind === "running") {
      result.current.onInterrupt()
    }

    expect(sent).toEqual([{ procedure: "usageReview.interrupt" }])
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

  it("主ボタンは種類と対象を添えて usageReview.runProposal を1回送る", () => {
    const sent: unknown[] = []
    const state = stateWith({
      usageReview: { kind: "result", reviewedAt: 0, findings: FIXTURE_FINDINGS },
    })
    const { result } = renderUsageReview(state, (command) => sent.push(command))

    if (result.current.kind === "result") {
      result.current.proposals[0]?.onPrimary()
    }

    expect(sent).toEqual([
      { procedure: "usageReview.runProposal", kind: "tool-result", target: "架空ツール" },
    ])
  })

  it("実行した提案の札にだけ実行の様子が出て、止めるは usageReview.interrupt を送る", () => {
    const sent: unknown[] = []
    const other = { ...FIXTURE_PROPOSAL, target: "別の架空ツール" }
    const state = stateWith({
      usageReview: {
        kind: "result",
        reviewedAt: 0,
        findings: { ...FIXTURE_FINDINGS, proposals: [FIXTURE_PROPOSAL, other] },
      },
      usageProposalRun: RUNNING_PROPOSAL_RUN,
    })
    const { result } = renderUsageReview(state, (command) => sent.push(command))

    const proposals = result.current.kind === "result" ? result.current.proposals : []
    const run = proposals[0]?.run
    expect(run?.kind).toBe("running")
    expect(run?.kind === "running" ? run.speech : undefined).toEqual({
      kind: "said",
      text: "架空の実行の声",
    })
    expect(proposals[1]?.run).toEqual({ kind: "none" })
    if (run?.kind === "running") {
      run.onInterrupt()
    }
    expect(sent).toEqual([{ procedure: "usageReview.interrupt" }])
  })

  it("終わった実行は、その札に終わり方とセリフを出す", () => {
    const state = stateWith({
      usageReview: { kind: "result", reviewedAt: 0, findings: FIXTURE_FINDINGS },
      usageProposalRun: {
        kind: "ended",
        key: "tool-result:架空ツール",
        outcome: "failed",
        speech: { kind: "none" },
      },
    })
    const { result } = renderUsageReview(state)

    expect(result.current.kind === "result" ? result.current.proposals[0]?.run : undefined).toEqual(
      { kind: "ended", outcome: "failed", speech: { kind: "none" } },
    )
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

  it("もう一度見てもらうは usageReview.start を送る", () => {
    const sent: unknown[] = []
    const state = stateWith({
      usageReview: { kind: "result", reviewedAt: 0, findings: FIXTURE_FINDINGS },
    })
    const { result } = renderUsageReview(state, (command) => sent.push(command))

    if (result.current.kind === "result") {
      result.current.onRetry()
    }

    expect(sent).toEqual([{ procedure: "usageReview.start" }])
  })

  it("提案の実行が走っている間は retry が blocked になる", () => {
    const state = stateWith({
      usageReview: { kind: "result", reviewedAt: 0, findings: FIXTURE_FINDINGS },
      usageProposalRun: RUNNING_PROPOSAL_RUN,
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

  it("前回の提案があってもふだんから始まる", () => {
    const state = stateWith({
      previousUsageReview: { kind: "found", reviewedAt: 0, findings: FIXTURE_FINDINGS },
    })
    const { result } = renderUsageReview(state)

    expect(result.current.kind).toBe("idle")
  })
})
