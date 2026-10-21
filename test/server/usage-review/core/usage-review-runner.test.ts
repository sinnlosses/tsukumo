import { describe, expect, it, vi } from "vitest"

import {
  createUsageReviewRunner,
  type UsageProposalQueryRequest,
  type UsageReviewQueryRequest,
  type UsageReviewPackContext,
  type UsageReviewRunnerPorts,
  type UsageReviewSource,
} from "../../../../src/server/usage-review/core/usage-review-runner.ts"
import type { UsageReviewIntake } from "../../../../src/server/usage-review/core/usage-review-tool.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import {
  USAGE_REVIEW_REQUEST_TEXT,
  type UsageProposal,
  type UsageReviewFindings,
  usageProposalKey,
} from "../../../../src/shared/usage-review/usage-review.ts"

// フィクスチャはすべて手で書いた架空の値。

const CONTEXT = {
  persona: "架空の人格",
  expressions: [],
  cwd: "/tmp/fictional",
  env: {},
} as const satisfies UsageReviewPackContext

const MODEL = "sonnet"

const PROPOSAL = {
  kind: "memory-file",
  target: "/tmp/fictional/CLAUDE.md",
  impact: "medium",
  title: "架空の見出し",
  basis: "架空の根拠",
  action: "架空のやること",
  followUp: "delegate",
} as const satisfies UsageProposal

const FINDINGS = {
  days: 7,
  headline: "架空の冒頭の一言。",
  proposals: [PROPOSAL],
} as const satisfies UsageReviewFindings

const KEY = usageProposalKey(PROPOSAL)

type ReviewQuery = (
  request: UsageReviewQueryRequest,
  intake: UsageReviewIntake,
  onEvent: (event: SessionEvent) => void,
  signal: AbortSignal,
) => Promise<void>

type ProposalQuery = (
  request: UsageProposalQueryRequest,
  onEvent: (event: SessionEvent) => void,
  signal: AbortSignal,
) => Promise<void>

/** 段を1つ渡して結果を渡す、架空の見直し。 */
const reviewWithResult: ReviewQuery = async (_request, intake) => {
  await intake.enterStage("model", 7)
  await intake.submit(FINDINGS)
}

/** 止められるまで待ち、止められたら reject する問い合わせ。 */
function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("中断")), { once: true })
  })
}

const hangingReview: ReviewQuery = (_request, _intake, _onEvent, signal) => untilAborted(signal)

const hangingProposal: ProposalQuery = (_request, _onEvent, signal) => untilAborted(signal)

function querySource(review: ReviewQuery, proposal: ProposalQuery): UsageReviewSource {
  return { kind: "query", review, proposal }
}

function ports(
  source: UsageReviewSource,
  overrides: Partial<UsageReviewRunnerPorts> = {},
): UsageReviewRunnerPorts {
  return {
    source,
    readContext: () => CONTEXT,
    dismissedKeys: () => [],
    hasTaskOperation: async () => true,
    writePreviousUsageReview: () => {},
    now: () => 1_000,
    ...overrides,
  }
}

/** 流れたイベントを積む口。 */
function recorder(): {
  readonly events: SessionEvent[]
  readonly onEvent: (event: SessionEvent) => void
} {
  const events: SessionEvent[] = []
  return { events, onEvent: (event) => events.push(event) }
}

describe("createUsageReviewRunner（見直し）", () => {
  it("始まり → 段 → 結果 → 終わりの順に流し、受け付けた結果をホームへ1回書く", async () => {
    const writePreviousUsageReview = vi.fn<UsageReviewRunnerPorts["writePreviousUsageReview"]>()
    const requests: UsageReviewQueryRequest[] = []
    const runner = createUsageReviewRunner(
      ports(
        querySource(async (request, intake, onEvent, signal) => {
          requests.push(request)
          await reviewWithResult(request, intake, onEvent, signal)
        }, hangingProposal),
        { writePreviousUsageReview },
      ),
    )
    const { events, onEvent } = recorder()

    expect(runner.startReview(MODEL, onEvent)).toBe(true)

    await vi.waitFor(() => expect(events.at(-1)).toEqual({ kind: "usage-review-ended" }))
    expect(events.map((event) => event.kind)).toEqual([
      "usage-review-started",
      "usage-review-stage",
      "usage-review-result",
      "usage-review-ended",
    ])
    expect(writePreviousUsageReview).toHaveBeenCalledExactlyOnceWith(1_000, FINDINGS)
    expect(requests[0]?.prompt).toBe(USAGE_REVIEW_REQUEST_TEXT)
    expect(requests[0]?.model).toBe(MODEL)
    expect(requests[0]?.systemPromptAppend.startsWith("架空の人格\n\n")).toBe(true)
  })

  it("問い合わせが失敗しても、終わりのイベントが1つ流れる", async () => {
    const runner = createUsageReviewRunner(
      ports(
        querySource(async () => {
          throw new Error("起こせない")
        }, hangingProposal),
      ),
    )
    const { events, onEvent } = recorder()

    runner.startReview(MODEL, onEvent)

    await vi.waitFor(() =>
      expect(events).toEqual([{ kind: "usage-review-started" }, { kind: "usage-review-ended" }]),
    )
  })

  it("走っている間は見直しも提案の実行も断り、終わったあとはまた始められる", async () => {
    const runner = createUsageReviewRunner(ports(querySource(hangingReview, hangingProposal)))
    const { events, onEvent } = recorder()

    expect(runner.startReview(MODEL, onEvent)).toBe(true)
    expect(runner.startReview(MODEL, onEvent)).toBe(false)
    expect(runner.runProposal(PROPOSAL, MODEL, onEvent)).toBe(false)

    runner.interrupt()
    await vi.waitFor(() => expect(events.at(-1)).toEqual({ kind: "usage-review-ended" }))
    expect(runner.startReview(MODEL, onEvent)).toBe(true)
  })

  it("パックがまだ決まっていなければ、始めずに断る", () => {
    const runner = createUsageReviewRunner(
      ports(querySource(reviewWithResult, hangingProposal), { readContext: () => undefined }),
    )
    const { events, onEvent } = recorder()

    expect(runner.startReview(MODEL, onEvent)).toBe(false)
    expect(runner.runProposal(PROPOSAL, MODEL, onEvent)).toBe(false)
    expect(events).toEqual([])
  })

  it("閉じると走っているものが止まり、以後は何も始めない", async () => {
    const runner = createUsageReviewRunner(ports(querySource(hangingReview, hangingProposal)))
    const { events, onEvent } = recorder()

    runner.startReview(MODEL, onEvent)
    runner.close()

    await vi.waitFor(() => expect(events.at(-1)).toEqual({ kind: "usage-review-ended" }))
    expect(runner.startReview(MODEL, onEvent)).toBe(false)
  })
})

describe("createUsageReviewRunner（提案の実行）", () => {
  it("走りきったら済んだで終わり、依頼文と押す口を問い合わせへ渡す", async () => {
    const requests: UsageProposalQueryRequest[] = []
    const runner = createUsageReviewRunner(
      ports(
        querySource(reviewWithResult, async (request, onEvent) => {
          requests.push(request)
          onEvent({ kind: "usage-review-speech", text: "架空のセリフ" })
        }),
      ),
    )
    const { events, onEvent } = recorder()

    expect(runner.runProposal(PROPOSAL, MODEL, onEvent)).toBe(true)

    await vi.waitFor(() =>
      expect(events).toEqual([
        { kind: "usage-proposal-run-started", key: KEY },
        { kind: "usage-review-speech", text: "架空のセリフ" },
        { kind: "usage-proposal-run-ended", key: KEY, outcome: "succeeded" },
      ]),
    )
    expect(requests[0]?.followUp).toBe("delegate")
    expect(requests[0]?.prompt).toContain("「架空の見出し」をやってほしい。")
  })

  it("問い合わせが失敗したら、できなかったで終わる", async () => {
    const runner = createUsageReviewRunner(
      ports(
        querySource(reviewWithResult, async () => {
          throw new Error("API の失敗")
        }),
      ),
    )
    const { events, onEvent } = recorder()

    runner.runProposal(PROPOSAL, MODEL, onEvent)

    await vi.waitFor(() =>
      expect(events.at(-1)).toEqual({
        kind: "usage-proposal-run-ended",
        key: KEY,
        outcome: "failed",
      }),
    )
  })

  it("止めると、止めたで終わる", async () => {
    const runner = createUsageReviewRunner(ports(querySource(reviewWithResult, hangingProposal)))
    const { events, onEvent } = recorder()

    runner.runProposal(PROPOSAL, MODEL, onEvent)
    runner.interrupt()

    await vi.waitFor(() =>
      expect(events.at(-1)).toEqual({
        kind: "usage-proposal-run-ended",
        key: KEY,
        outcome: "interrupted",
      }),
    )
  })
})

describe("createUsageReviewRunner（疑似セッションの再生）", () => {
  it("手順を順に流し、前回の結果はホームに書かない", async () => {
    const writePreviousUsageReview = vi.fn<UsageReviewRunnerPorts["writePreviousUsageReview"]>()
    const runner = createUsageReviewRunner(
      ports(
        {
          kind: "replay",
          review: [
            { afterMs: 0, event: { kind: "usage-review-stage", stage: "model", days: 7 } },
            { afterMs: 10, event: { kind: "usage-review-speech", text: "架空のセリフ" } },
            { afterMs: 20, event: { kind: "usage-review-result", findings: FINDINGS } },
          ],
          proposal: [{ afterMs: 0, event: { kind: "usage-review-speech", text: "架空の一言" } }],
        },
        { writePreviousUsageReview },
      ),
    )
    const review = recorder()
    const proposal = recorder()

    runner.startReview(MODEL, review.onEvent)
    await vi.waitFor(() => expect(review.events.at(-1)).toEqual({ kind: "usage-review-ended" }))
    runner.runProposal(PROPOSAL, MODEL, proposal.onEvent)
    await vi.waitFor(() =>
      expect(proposal.events.at(-1)).toEqual({
        kind: "usage-proposal-run-ended",
        key: KEY,
        outcome: "succeeded",
      }),
    )

    expect(review.events.map((event) => event.kind)).toEqual([
      "usage-review-started",
      "usage-review-stage",
      "usage-review-speech",
      "usage-review-result",
      "usage-review-ended",
    ])
    expect(proposal.events.map((event) => event.kind)).toEqual([
      "usage-proposal-run-started",
      "usage-review-speech",
      "usage-proposal-run-ended",
    ])
    expect(writePreviousUsageReview).not.toHaveBeenCalled()
  })
})
