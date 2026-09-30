import { describe, expect, it } from "vitest"

import {
  applyUsageReviewEvent,
  settleUsageReview,
  type UsageProposal,
  type UsageReview,
  type UsageReviewFields,
  type UsageReviewFindings,
  usageProposalKey,
  usageProposalRequestText,
  withoutDismissedProposals,
} from "../../../src/shared/usage-review/usage-review.ts"

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

  const IDLE: UsageReviewFields = {
    usageReview: { kind: "idle" },
    previousUsageReview: { kind: "none" },
  }

  const STAGE_EVENT = { kind: "usage-review-stage", stage: "model", days: 7 } as const

  const RESULT: UsageReviewFields = {
    usageReview: { kind: "result", reviewedAt: 700, findings: FINDINGS },
    previousUsageReview: { kind: "found", reviewedAt: 700, findings: FINDINGS },
  }

  it("段が届くと見直し中になり、始まりは渡された時刻・段は届いた段", () => {
    expect(applyUsageReviewEvent(IDLE, STAGE_EVENT, 300, 100)).toEqual({
      usageReview: { kind: "running", startedAt: 100, days: 7, stage: "model" },
      previousUsageReview: { kind: "none" },
    })
  })

  it("見直し中に次の段が届いても始まりは動かさない", () => {
    const running = applyUsageReviewEvent(IDLE, STAGE_EVENT, 300, 100)
    const next = applyUsageReviewEvent(
      running,
      { kind: "usage-review-stage", stage: "cache", days: 7 },
      500,
      500,
    )

    expect(next.usageReview).toEqual({ kind: "running", startedAt: 100, days: 7, stage: "cache" })
  })

  it("結果が届くと、見直しと前回の結果が同じ結果に揃う", () => {
    const running = applyUsageReviewEvent(IDLE, STAGE_EVENT, 300, 100)

    expect(
      applyUsageReviewEvent(running, { kind: "usage-review-result", findings: FINDINGS }, 700, 700),
    ).toEqual(RESULT)
  })

  it("見送った提案は、見直しと前回の結果の両方から除かれる", () => {
    const dismissed = applyUsageReviewEvent(
      RESULT,
      { kind: "usage-proposal-dismissed", key: usageProposalKey(PROPOSAL) },
      800,
      800,
    )
    const remaining = { ...FINDINGS, proposals: [FINDINGS.proposals[1]] }

    expect(dismissed).toEqual({
      usageReview: { kind: "result", reviewedAt: 700, findings: remaining },
      previousUsageReview: { kind: "found", reviewedAt: 700, findings: remaining },
    })
  })

  it("結果でも前回の結果でもなければ、見送りは何も変えない", () => {
    const running = applyUsageReviewEvent(IDLE, STAGE_EVENT, 300, 100)

    expect(
      applyUsageReviewEvent(
        running,
        { kind: "usage-proposal-dismissed", key: usageProposalKey(PROPOSAL) },
        800,
        800,
      ),
    ).toEqual(running)
  })
})

describe("settleUsageReview", () => {
  it("見直し中はふだんへ戻し、結果とふだんはそのままにする", () => {
    const result = {
      kind: "result",
      reviewedAt: 700,
      findings: { days: 7, headline: "架空の冒頭の一言。", proposals: [] },
    } as const satisfies UsageReview

    expect(settleUsageReview({ kind: "running", startedAt: 100, days: 7, stage: "model" })).toEqual(
      { kind: "idle" },
    )
    expect(settleUsageReview(result)).toEqual(result)
    expect(settleUsageReview({ kind: "idle" })).toEqual({ kind: "idle" })
  })
})
