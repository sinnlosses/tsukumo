import { describe, expect, it } from "vitest"

import { createUsageReviewIntake } from "../../../../src/server/usage-review/core/usage-review-tool.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { usageProposalKey } from "../../../../src/shared/usage-review/usage-review.ts"

const DISMISSED_PROPOSAL = {
  kind: "session-length",
  target: "",
  impact: "medium",
  title: "見送られる架空の提案",
  basis: "架空の根拠",
  action: "架空のやること",
  followUp: "delegate",
} as const

const KEPT_PROPOSAL = {
  ...DISMISSED_PROPOSAL,
  kind: "model-choice",
  target: "sonnet",
  title: "残る架空の提案",
} as const

const TASK_PROPOSAL = {
  ...KEPT_PROPOSAL,
  target: "haiku",
  title: "あとでやる架空の提案",
  followUp: "task",
} as const

const withTaskOperation = async (): Promise<boolean> => true
const withoutTaskOperation = async (): Promise<boolean> => false

describe("見送った提案の一覧（usage_review_stage の戻り値）", () => {
  it("見送った提案の識別子が、usage_review_stage の戻り値に載る", async () => {
    const intake = createUsageReviewIntake(
      () => [usageProposalKey(DISMISSED_PROPOSAL)],
      withTaskOperation,
      () => {},
    )

    const reply = await intake.enterStage("model", 7)

    expect(reply).toBe(
      [
        "ok",
        "利用者が見送った提案（種類:対象）。usage_review_result に入れない:",
        `- ${usageProposalKey(DISMISSED_PROPOSAL)}`,
      ].join("\n"),
    )
  })

  it('一度も見送っていないときは usage_review_stage の戻り値が "ok" だけ', async () => {
    const intake = createUsageReviewIntake(
      () => [],
      withTaskOperation,
      () => {},
    )

    expect(await intake.enterStage("model", 7)).toBe("ok")
  })
})

describe("タスク運用が無いプロジェクトでの見直し", () => {
  it("usage_review_stage の戻り値で、followUp に task を使わないよう伝える", async () => {
    const intake = createUsageReviewIntake(
      () => [],
      withoutTaskOperation,
      () => {},
    )

    expect(await intake.enterStage("model", 7)).toBe(
      [
        "ok",
        "タスク運用なし（起動先の .beads が読めない）。提案の followUp は delegate だけにする",
      ].join("\n"),
    )
  })

  it("followUp が task の提案を含む結果は差し戻され、状態も変わらない", async () => {
    const events: SessionEvent[] = []
    const intake = createUsageReviewIntake(
      () => [],
      withoutTaskOperation,
      (event) => events.push(event),
    )

    const verdict = await intake.submit({
      days: 7,
      headline: "架空の冒頭の一言。",
      proposals: [KEPT_PROPOSAL, TASK_PROPOSAL],
    })

    expect(verdict).toEqual({
      kind: "rejected",
      text: [
        "見直しの結果を受け付けられない。直して `usage_review_result` を呼び直すこと:",
        "- タスク運用が無いのに `followUp` が `task` の提案が1件ある。`delegate` にする",
      ].join("\n"),
    })
    expect(events).toEqual([])
  })
})
