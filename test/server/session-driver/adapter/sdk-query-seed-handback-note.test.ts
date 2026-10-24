import { describe, expect, it } from "vitest"

import { handbackNoteHooks } from "../../../../src/server/session-driver/adapter/sdk-query-seed.ts"
import { PHASE_RESULT_MISSING_HANDBACK_LINE } from "../../../../src/server/session-driver/core/band-position.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

describe("handbackNoteHooks（返却を運ぶ入力に注記を添える）", () => {
  const HANDBACK_PROMPT =
    '<agent-message from="架空の委譲先">\n[架空の前置き]\n  段 1/2 | 架空の返却。'

  async function runUserPromptSubmit(
    review: CallReview,
    prompt: string,
    agentId?: string,
    reportHeadMismatch: () => void = () => {},
  ): Promise<unknown> {
    const callback = handbackNoteHooks(review, reportHeadMismatch).UserPromptSubmit?.[0]?.hooks[0]
    expect(callback).toBeDefined()
    return callback?.(
      {
        session_id: "s-1",
        transcript_path: "/tmp/tsukumo-test/fake.jsonl",
        cwd: "/tmp/tsukumo-test",
        hook_event_name: "UserPromptSubmit",
        prompt,
        ...(agentId === undefined ? {} : { agent_id: agentId }),
      },
      undefined,
      { signal: new AbortController().signal },
    )
  }

  const plannedReview = () => {
    const review = createCallReview()
    review.pass(requestEvent())
    review.judgeWorkPlan({
      phases: ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"],
      current: 1,
      phaseSummary: "架空のまとめ。",
      delegatedRange: { first: 1, count: 2 },
    })
    return review
  }

  const startedReview = () => {
    const review = plannedReview()
    review.pass({ kind: "delegate-handed-back", delegate: "toolu_delegate" })
    return review
  }

  it("メインの返却の入力に、済んだ帯の段と帯の位置の注記を additionalContext で1回だけ添える", async () => {
    const review = startedReview()

    expect(await runUserPromptSubmit(review, HANDBACK_PROMPT)).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          `tsukumo の注記（委譲先の返却の本文ではない）:${PHASE_RESULT_MISSING_HANDBACK_LINE}` +
          "帯の今の段は 本 1/2 架空の実装A。帯は範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数え、本の番号は委譲先の段の番号と同じ。セリフで番号を言うのは本の段だけで、前・後の段は名前で言う。",
      },
    })
    expect(await runUserPromptSubmit(review, HANDBACK_PROMPT)).toEqual({})
  })

  it("返却でない入力とサブエージェントの中の入力では何も返さず、注記を取り出さない", async () => {
    const review = startedReview()

    expect(await runUserPromptSubmit(review, "架空の依頼")).toEqual({})
    expect(await runUserPromptSubmit(review, HANDBACK_PROMPT, "agent-1")).toEqual({})
    expect(review.takeHandbackNote()).toContain(PHASE_RESULT_MISSING_HANDBACK_LINE)
  })

  it("注記が溜まったまま頭の合わないメインの入力が届いたら、包みの形が変わったと知らせる", async () => {
    const reported: string[] = []
    const report = () => {
      reported.push("mismatch")
    }

    await runUserPromptSubmit(startedReview(), "<架空の新しい包み>架空の返却", undefined, report)
    expect(reported).toEqual(["mismatch"])
  })

  it("注記が溜まっていなければ、頭の合わない入力でも知らせない", async () => {
    const reported: string[] = []
    const report = () => {
      reported.push("mismatch")
    }

    await runUserPromptSubmit(plannedReview(), "架空の依頼", undefined, report)
    await runUserPromptSubmit(startedReview(), "架空の依頼", "agent-1", report)
    expect(reported).toEqual([])
  })
})
