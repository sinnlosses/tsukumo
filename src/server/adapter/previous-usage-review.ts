// 前回の見直し（docs/glossary.md「見直し」）の結果。**トークン消費の画面の「前回の提案」の
// リンクが読む**——起こし直した直後もふだん（`usageReview: { kind: "idle" }`）から始まるので
// （`docs/design.md`「見直しのツールと状態」）、直前の結果を出すのはこの記録の役目。
//
// **持つのは直前の1回だけ**。見本の「前回の提案（日付）」も直前の1回しか指さないので、古い
// 結果を並べて選ぶ画面は無い。新しい結果が届くたびに丸ごと置き換え、履歴は残さない。
//
// ファイルに触るのはここだけ（原則3。1ファイル = 1つの境界）。置き場は `~/.tsukumo/usage-review.json`。
//
// 会話の文面は書かない——入るのは見直しの結果（{@link UsageReviewFindings}）だけで、その型に
// そもそも文面の口が無い（docs/coding-standards.md「会話内容の扱い」）。

import { join } from "node:path"

import { z } from "zod"

import {
  type PreviousUsageReview,
  USAGE_PROPOSAL_FOLLOW_UPS,
  USAGE_PROPOSAL_IMPACTS,
  USAGE_PROPOSAL_KINDS,
  type UsageReviewFindings,
} from "../../shared/usage-review.ts"
import { readJsonFile, writeJsonFile } from "./lib/json-file.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

const PREVIOUS_USAGE_REVIEW_FILE_NAME = "usage-review.json"

/** ファイルの形の版。形を変えたら上げ、古いファイルと見分ける（`token-usage-log.ts` と同じ考え方）。 */
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
 * 前回の結果を読む。**ファイルが無い・JSON が壊れている・版や形が違うときは
 * `{ kind: "none" }`**（一度も見直していないのと同じ扱い。呼び出し側はリンクを出さない）。
 *
 * `path` は差し替えられる（既定は {@link previousUsageReviewPath}）——テストがホームを
 * 汚さないため（`remembered-default.ts` の `path` 引数と同じ手）。
 */
export function readPreviousUsageReview(
  path: string = previousUsageReviewPath(),
): PreviousUsageReview {
  const parsed = previousUsageReviewFileSchema.safeParse(readJsonFile(path))
  return parsed.success
    ? { kind: "found", reviewedAt: parsed.data.reviewedAt, findings: parsed.data.findings }
    : { kind: "none" }
}

/**
 * 結果を書く。**直前の1回だけを持つ**ので、丸ごと置き換える（履歴は残さない）。失敗しても
 * 例外を投げない（常駐プロセスは1回の失敗で落ちない）。
 */
export function writePreviousUsageReview(
  reviewedAt: number,
  findings: UsageReviewFindings,
  path: string = previousUsageReviewPath(),
): void {
  writeJsonFile(path, { v: PREVIOUS_USAGE_REVIEW_FORMAT_VERSION, reviewedAt, findings })
}
