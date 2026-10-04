import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "../../../../src/server/usage-review/adapter/usage-proposal-dismissal.ts"
import { createUsageReviewIntake } from "../../../../src/server/usage-review/core/usage-review-tool.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import {
  type UsageReviewFindings,
  usageProposalKey,
} from "../../../../src/shared/usage-review/usage-review.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 見送った提案の一覧が、ホームのファイル（読み書きは
// `readDismissedUsageProposalKeys`）から `createUsageReviewIntake` へ実際に
// 渡ることを確かめる（別のテストは同じ口を偽の配列で確かめている）。

const dir = useTempDir("usage-review-dismissal-wiring")

function path(): string {
  return join(dir(), "usage-review-dismissed.json")
}

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

describe("見送った提案の一覧（ホームのファイル → usage-review-tool.ts）", () => {
  it("見送ったあとの usage_review_stage の戻り値に、実際にホームへ書いた識別子が載る", async () => {
    writeDismissedUsageProposalKey(usageProposalKey(DISMISSED_PROPOSAL), path())

    const events: SessionEvent[] = []
    const intake = createUsageReviewIntake(
      () => readDismissedUsageProposalKeys(path()),
      withTaskOperation,
      (event) => events.push(event),
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

  it("見送った提案を含む結果は差し戻され、状態も変わらない", async () => {
    writeDismissedUsageProposalKey(usageProposalKey(DISMISSED_PROPOSAL), path())

    const events: SessionEvent[] = []
    const intake = createUsageReviewIntake(
      () => readDismissedUsageProposalKeys(path()),
      withTaskOperation,
      (event) => events.push(event),
    )

    const findings: UsageReviewFindings = {
      days: 7,
      headline: "架空の冒頭の一言。",
      proposals: [DISMISSED_PROPOSAL],
    }
    const verdict = await intake.submit(findings)

    expect(verdict.kind).toBe("rejected")
    expect(events).toEqual([])
  })

  it("見送っていない提案だけの結果は受け付けられる", async () => {
    writeDismissedUsageProposalKey(usageProposalKey(DISMISSED_PROPOSAL), path())

    const events: SessionEvent[] = []
    const intake = createUsageReviewIntake(
      () => readDismissedUsageProposalKeys(path()),
      withTaskOperation,
      (event) => events.push(event),
    )

    const findings: UsageReviewFindings = {
      days: 7,
      headline: "架空の冒頭の一言。",
      proposals: [KEPT_PROPOSAL],
    }
    const verdict = await intake.submit(findings)

    expect(verdict).toEqual({ kind: "accepted" })
    expect(events).toEqual([{ kind: "usage-review-result", findings }])
  })

  it('一度も見送っていないときは usage_review_stage の戻り値が "ok" だけ', async () => {
    const intake = createUsageReviewIntake(
      () => readDismissedUsageProposalKeys(path()),
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
        "タスク運用なし（起動先のプロジェクトの設定に tasks が無い）。提案の followUp は delegate だけにする",
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
