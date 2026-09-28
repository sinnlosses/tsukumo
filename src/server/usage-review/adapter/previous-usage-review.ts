// 前回の見直しの結果。
// 起こし直した直後もふだん（`usageReview: { kind: "idle" }`）から始まるので、直前の結果を「前回の提案」として出すのはこの記録の役目。
//
// 持つのは直前の1回だけ。新しい結果が届くたびに丸ごと置き換え、履歴は残さない。
//
// ファイルに触るのはここだけ。置き場は `~/.tsukumo/usage-review.json`。
//
// 会話の文面は書かない。入るのは見直しの結果（`UsageReviewFindings`）だけで、その型にそもそも文面の口が無い。

import { join } from "node:path"

import { z } from "zod"

import {
  type PreviousUsageReview,
  USAGE_PROPOSAL_FOLLOW_UPS,
  USAGE_PROPOSAL_IMPACTS,
  USAGE_PROPOSAL_KINDS,
  type UsageReviewFindings,
} from "../../../shared/usage-review/usage-review.ts"
import { readJsonFile, writeJsonFile } from "../../adapter/lib/json-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"

const PREVIOUS_USAGE_REVIEW_FILE_NAME = "usage-review.json"

/** ファイルの形の版。形を変えたら上げ、古いファイルと見分ける。 */
const PREVIOUS_USAGE_REVIEW_FORMAT_VERSION = 1 satisfies number

const usageProposalSchema = z.object({
  kind: z.enum(USAGE_PROPOSAL_KINDS),
  target: z.string(),
  impact: z.enum(USAGE_PROPOSAL_IMPACTS),
  title: z.string(),
  basis: z.string(),
  action: z.string(),
  followUp: z.enum(USAGE_PROPOSAL_FOLLOW_UPS),
})

const usageReviewFindingsSchema = z.object({
  days: z.number(),
  headline: z.string(),
  proposals: z.array(usageProposalSchema),
})

/** ファイルの中身の形（{@link UsageReviewFindings} と同じ鍵に `v` と `reviewedAt` を添えたもの）。 */
const previousUsageReviewFileSchema = z.object({
  v: z.literal(PREVIOUS_USAGE_REVIEW_FORMAT_VERSION),
  reviewedAt: z.number(),
  findings: usageReviewFindingsSchema,
})

/** 書き込んでよいのはこの1ファイルだけ。 */
export function previousUsageReviewPath(): string {
  return join(tsukumoHomeDir(), PREVIOUS_USAGE_REVIEW_FILE_NAME)
}

/**
 * 前回の結果を読む。
 * ファイルが無い・JSON が壊れている・版や形が違うときは `{ kind: "none" }`（一度も見直していないのと同じ扱い）。
 *
 * `path` の既定は {@link previousUsageReviewPath}。
 */
export function readPreviousUsageReview(
  path: string = previousUsageReviewPath(),
): PreviousUsageReview {
  const parsed = previousUsageReviewFileSchema.safeParse(readJsonFile(path))
  return parsed.success
    ? { kind: "found", reviewedAt: parsed.data.reviewedAt, findings: parsed.data.findings }
    : { kind: "none" }
}

/** 結果を書く。直前の1回だけを持つので、丸ごと置き換える（履歴は残さない）。失敗しても例外を投げない。 */
export function writePreviousUsageReview(
  reviewedAt: number,
  findings: UsageReviewFindings,
  path: string = previousUsageReviewPath(),
): void {
  writeJsonFile(path, { v: PREVIOUS_USAGE_REVIEW_FORMAT_VERSION, reviewedAt, findings })
}
