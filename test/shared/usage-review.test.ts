import { describe, expect, it } from "bun:test"

import {
  type UsageProposal,
  usageProposalKey,
  usageProposalRequestText,
} from "../../src/shared/usage-review.ts"

// 提案は手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
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
