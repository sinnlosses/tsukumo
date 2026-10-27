import { describe, expect, it } from "vitest"

import {
  applyUsageReviewEvent,
  type UsageProposal,
  type UsageReviewEvent,
  type UsageReviewFields,
  type UsageReviewFindings,
  usageProposalKey,
  usageProposalRequestText,
  withoutDismissedProposals,
} from "../../../src/shared/usage/usage-review.ts"

const PROPOSAL = {
  kind: "unused-mcp",
  target: "example-server",
  impact: "small",
  title: "架空の見出し",
  basis: "架空の根拠",
  action: "架空のやること",
  followUp: "delegate",
} as const satisfies UsageProposal

describe("usageProposalKey", () => {
  it("種類と対象の組で、言い回しが変わっても同じ識別子になる", () => {
    const reworded: UsageProposal = { ...PROPOSAL, title: "別の言い回し", basis: "別の根拠" }
    expect(usageProposalKey(reworded)).toBe(usageProposalKey(PROPOSAL))
    expect(usageProposalKey(PROPOSAL)).toBe("unused-mcp:example-server")
  })

  it("対象の前後の空白は識別子に入れない", () => {
    expect(usageProposalKey({ kind: "tool-result", target: " Bash " })).toBe("tool-result:Bash")
  })
})

describe("usageProposalRequestText", () => {
  it("押す口ごとに頼み方が変わり、見出し・やること・根拠が入る", () => {
    const delegate = usageProposalRequestText(PROPOSAL)
    const task = usageProposalRequestText({ ...PROPOSAL, followUp: "task" })

    expect(delegate).toContain("「架空の見出し」をやってほしい。")
    expect(task).toContain("「架空の見出し」をあとでやるタスクとして登録してほしい")
    expect(delegate).toContain("やること: 架空のやること")
    expect(delegate).toContain("根拠: 架空の根拠")
  })
})

describe("withoutDismissedProposals", () => {
  it("見送った識別子の提案を前回の結果から除き、ほかは残す", () => {
    const other = { ...PROPOSAL, kind: "memory-file", target: "" } as const satisfies UsageProposal
    const previous = withoutDismissedProposals(
      {
        kind: "found",
        reviewedAt: 1,
        findings: { days: 7, headline: "架空の一言", proposals: [PROPOSAL, other] },
      },
      [usageProposalKey(PROPOSAL)],
    )
    expect(previous.kind === "found" ? previous.findings.proposals : []).toEqual([other])
  })

  it("前回の結果が無ければそのまま返す", () => {
    expect(withoutDismissedProposals({ kind: "none" }, ["unused-mcp:example-server"])).toEqual({
      kind: "none",
    })
  })
})

describe("applyUsageReviewEvent", () => {
  const FINDINGS = {
    days: 7,
    headline: "架空の冒頭の一言。",
    proposals: [PROPOSAL, { ...PROPOSAL, target: "another-server" }],
  } as const satisfies UsageReviewFindings

  const KEY = usageProposalKey(PROPOSAL)

  const IDLE: UsageReviewFields = {
    usageReview: { kind: "idle" },
    previousUsageReview: { kind: "none" },
    usageProposalRun: { kind: "idle" },
  }

  const RESULT: UsageReviewFields = {
    usageReview: { kind: "result", reviewedAt: 700, findings: FINDINGS },
    previousUsageReview: { kind: "found", reviewedAt: 700, findings: FINDINGS },
    usageProposalRun: { kind: "idle" },
  }

  /** 時刻つきのイベントを順に畳む。 */
  function fold(
    fields: UsageReviewFields,
    events: readonly (readonly [number, UsageReviewEvent])[],
  ): UsageReviewFields {
    return events.reduce(
      (current, [at, event]) => applyUsageReviewEvent(current, event, at),
      fields,
    )
  }

  it("始まると、段の届く前から見直し中になり、始まりはそのイベントの時刻", () => {
    expect(fold(IDLE, [[100, { kind: "usage-review-started" }]]).usageReview).toEqual({
      kind: "running",
      startedAt: 100,
      progress: { kind: "preparing" },
      speech: { kind: "none" },
    })
  })

  it("段とセリフが届いても始まりは動かず、段とセリフだけが差し替わる", () => {
    const running = fold(IDLE, [
      [100, { kind: "usage-review-started" }],
      [300, { kind: "usage-review-stage", stage: "model", days: 7 }],
      [400, { kind: "usage-review-speech", text: "架空のセリフ" }],
      [500, { kind: "usage-review-stage", stage: "cache", days: 7 }],
    ])

    expect(running.usageReview).toEqual({
      kind: "running",
      startedAt: 100,
      progress: { kind: "stage", stage: "cache", days: 7 },
      speech: { kind: "said", text: "架空のセリフ" },
    })
  })

  it("結果が届くと、見直しと前回の結果が同じ結果に揃い、そのあとの終わりは結果を残す", () => {
    const result = fold(IDLE, [
      [100, { kind: "usage-review-started" }],
      [700, { kind: "usage-review-result", findings: FINDINGS }],
    ])

    expect(result).toEqual(RESULT)
    expect(fold(result, [[800, { kind: "usage-review-ended" }]])).toEqual(RESULT)
  })

  it("結果を渡さずに終わると、ふだんへ戻る", () => {
    const ended = fold(IDLE, [
      [100, { kind: "usage-review-started" }],
      [300, { kind: "usage-review-stage", stage: "model", days: 7 }],
      [800, { kind: "usage-review-ended" }],
    ])

    expect(ended).toEqual(IDLE)
  })

  it("提案の実行は始まり→セリフ→終わりで、終わった姿にセリフと終わり方が残る", () => {
    const running = fold(RESULT, [
      [900, { kind: "usage-proposal-run-started", key: KEY }],
      [950, { kind: "usage-review-speech", text: "架空のセリフ" }],
    ])
    const ended = fold(running, [
      [1000, { kind: "usage-proposal-run-ended", key: KEY, outcome: "succeeded" }],
    ])

    expect(running.usageProposalRun).toEqual({
      kind: "running",
      key: KEY,
      startedAt: 900,
      speech: { kind: "said", text: "架空のセリフ" },
    })
    expect(ended).toEqual({
      ...RESULT,
      usageProposalRun: {
        kind: "ended",
        key: KEY,
        outcome: "succeeded",
        speech: { kind: "said", text: "架空のセリフ" },
      },
    })
  })

  it("走っていない提案の終わりと、何も走っていないときのセリフは何も変えない", () => {
    expect(
      fold(RESULT, [
        [1000, { kind: "usage-proposal-run-ended", key: KEY, outcome: "failed" }],
        [1100, { kind: "usage-review-speech", text: "架空のセリフ" }],
      ]),
    ).toEqual(RESULT)
  })

  it("見送った提案は、見直しと前回の結果の両方から除かれる", () => {
    const dismissed = fold(RESULT, [[800, { kind: "usage-proposal-dismissed", key: KEY }]])
    const remaining = { ...FINDINGS, proposals: [FINDINGS.proposals[1]] }

    expect(dismissed).toEqual({
      usageReview: { kind: "result", reviewedAt: 700, findings: remaining },
      previousUsageReview: { kind: "found", reviewedAt: 700, findings: remaining },
      usageProposalRun: { kind: "idle" },
    })
  })

  it("結果でも前回の結果でもなければ、見送りは何も変えない", () => {
    const running = fold(IDLE, [[100, { kind: "usage-review-started" }]])

    expect(fold(running, [[800, { kind: "usage-proposal-dismissed", key: KEY }]])).toEqual(running)
  })
})
