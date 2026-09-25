import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "../../../../src/server/usage-review/adapter/usage-proposal-dismissal.ts"
import { createUsageReviewIntake } from "../../../../src/server/usage-review/core/usage-review-tool.ts"
import { type SessionEvent } from "../../../../src/shared/session-event.ts"
import { type UsageReviewFindings, usageProposalKey } from "../../../../src/shared/usage-review.ts"

// 見送った提案の一覧が、ホームのファイル（読み書きは
// `src/server/usage-review/adapter/usage-proposal-dismissal.ts`）から `createUsageReviewIntake` へ実際に
// 渡ることを確かめる（`test/server/session-driver/adapter/sdk-tool.test.ts` は同じ口を偽の配列で確かめている）。

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-usage-review-dismissal-wiring-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function path(): string {
  return join(dir, "usage-review-dismissed.json")
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

describe("見送った提案の一覧（ホームのファイル → usage-review-tool.ts）", () => {
  it("見送ったあとの usage_review_stage の戻り値に、実際にホームへ書いた識別子が載る", () => {
    writeDismissedUsageProposalKey(usageProposalKey(DISMISSED_PROPOSAL), path())

    const events: SessionEvent[] = []
    const intake = createUsageReviewIntake(
      () => readDismissedUsageProposalKeys(path()),
      (event) => events.push(event),
    )

    const reply = intake.enterStage("model", 7)

    expect(reply).toBe(
      [
        "ok",
        "利用者が見送った提案（種類:対象）。usage_review_result に入れない:",
        `- ${usageProposalKey(DISMISSED_PROPOSAL)}`,
      ].join("\n"),
    )
  })

  it("見送った提案を含む結果は差し戻され、状態も変わらない", () => {
    writeDismissedUsageProposalKey(usageProposalKey(DISMISSED_PROPOSAL), path())

    const events: SessionEvent[] = []
    const intake = createUsageReviewIntake(
      () => readDismissedUsageProposalKeys(path()),
      (event) => events.push(event),
    )

    const findings: UsageReviewFindings = {
      days: 7,
      headline: "架空の冒頭の一言。",
      proposals: [DISMISSED_PROPOSAL],
    }
    const verdict = intake.submit(findings)

    expect(verdict.kind).toBe("rejected")
    expect(events).toEqual([])
  })

  it("見送っていない提案だけの結果は受け付けられる", () => {
    writeDismissedUsageProposalKey(usageProposalKey(DISMISSED_PROPOSAL), path())

    const events: SessionEvent[] = []
    const intake = createUsageReviewIntake(
      () => readDismissedUsageProposalKeys(path()),
      (event) => events.push(event),
    )

    const findings: UsageReviewFindings = {
      days: 7,
      headline: "架空の冒頭の一言。",
      proposals: [KEPT_PROPOSAL],
    }
    const verdict = intake.submit(findings)

    expect(verdict).toEqual({ kind: "accepted" })
    expect(events).toEqual([{ kind: "usage-review-result", findings }])
  })

  it('一度も見送っていないときは usage_review_stage の戻り値が "ok" だけ', () => {
    const intake = createUsageReviewIntake(
      () => readDismissedUsageProposalKeys(path()),
      () => {},
    )

    expect(intake.enterStage("model", 7)).toBe("ok")
  })
})
