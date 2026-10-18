import { describe, expect, it } from "vitest"

import { FRAME_ERROR_REASON } from "../src/shared/frame.ts"
import { BUILTIN_SESSION_DEFAULT } from "../src/shared/session/session-default.ts"
import type { SessionEvent } from "../src/shared/session/session-event.ts"
import { type UsageProposal, usageProposalKey } from "../src/shared/usage-review/usage-review.ts"
import { REQUEST_EVENT, startRouter } from "./fixture/command-router.ts"

describe("createCommandRouter（usageReview。トークン消費の画面の見直し）", () => {
  const proposal = {
    kind: "tool-result",
    target: "ExampleTool",
    impact: "large",
    title: "架空の見出し",
    basis: "架空の根拠",
    action: "架空のやること",
    followUp: "delegate",
  } as const satisfies UsageProposal
  const resultEvent = {
    kind: "usage-review-result",
    findings: { days: 7, headline: "架空の一言。", proposals: [proposal] },
  } as const satisfies SessionEvent

  it("start はターン中でも受け、会話のモデル（無ければ既定）で頼んで走りのイベントをいまの代へ流す。走っている間の2回目は断る", async () => {
    const { commands, stub, observe, emitted, usageReviewCalls } = startRouter()
    observe(REQUEST_EVENT)

    expect(await commands.usageReview.start()).toEqual({ ok: true })
    expect(await commands.usageReview.start()).toEqual({
      ok: false,
      reason: FRAME_ERROR_REASON.usageReviewRunning,
    })

    const model = BUILTIN_SESSION_DEFAULT.model
    expect(usageReviewCalls).toEqual([`start:${model}`, `start:${model}`])
    expect(emitted).toEqual([{ kind: "usage-review-started" }])
    expect(stub.calls).toEqual([])
  })

  it("runProposal は結果にある提案を識別子で引いて頼み、見つからない識別子は走りへ渡さずに断る", async () => {
    const { commands, observe, usageReviewCalls } = startRouter()
    observe(resultEvent)

    expect(
      await commands.usageReview.runProposal({ kind: "tool-result", target: "UnknownTool" }),
    ).toEqual({ ok: false, reason: FRAME_ERROR_REASON.usageProposalNotFound })
    expect(
      await commands.usageReview.runProposal({ kind: proposal.kind, target: proposal.target }),
    ).toEqual({ ok: true })

    expect(usageReviewCalls).toEqual([
      `runProposal:${usageProposalKey(proposal)}:${BUILTIN_SESSION_DEFAULT.model}`,
    ])
  })

  it("interrupt は走っていなくても受け、止めたあとは次の start を受ける", async () => {
    const { commands, usageReviewCalls } = startRouter()

    expect(await commands.usageReview.interrupt()).toEqual({ ok: true })
    expect(await commands.usageReview.start()).toEqual({ ok: true })
    expect(await commands.usageReview.interrupt()).toEqual({ ok: true })
    expect(await commands.usageReview.start()).toEqual({ ok: true })

    const model = BUILTIN_SESSION_DEFAULT.model
    expect(usageReviewCalls).toEqual(["interrupt", `start:${model}`, "interrupt", `start:${model}`])
  })
})
