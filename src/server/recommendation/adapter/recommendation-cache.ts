// おすすめの札のキャッシュ。ファイルに触るのはここだけで、置き場は `~/.tsukumo/recommendation.json`。
// 入るのは候補の並びの印（タスク一覧から作ったもの）と札（候補のキーと理由の1行）の組だけで、会話は入らない。

import { join } from "node:path"

import { z } from "zod"

import type { RecommendationCard } from "../../../shared/recommendation/recommendation-card.ts"
import { readJsonFile, writeJsonFile } from "../../adapter/lib/json-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { RecommendationCacheEntry } from "../core/recommender.ts"

const RECOMMENDATION_CACHE_FILE_NAME = "recommendation.json"

/** ファイルの形の版。形を変えたら上げ、古いファイルと見分ける。 */
const RECOMMENDATION_CACHE_FORMAT_VERSION = 1 satisfies number

const recommendationCardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resume"), reason: z.string() }),
  z.object({ kind: z.literal("task"), taskId: z.string(), reason: z.string() }),
]) satisfies z.ZodType<RecommendationCard>

const recommendationCacheFileSchema = z.object({
  v: z.literal(RECOMMENDATION_CACHE_FORMAT_VERSION),
  entries: z.array(z.object({ key: z.string(), cards: z.array(recommendationCardSchema) })),
})

export function recommendationCachePath(): string {
  return join(tsukumoHomeDir(), RECOMMENDATION_CACHE_FILE_NAME)
}

/** 組を新しい順に読む。ファイルが無い・壊れている・版や形が違うときは空。 */
export function readRecommendationCache(
  path: string = recommendationCachePath(),
): readonly RecommendationCacheEntry[] {
  const parsed = recommendationCacheFileSchema.safeParse(readJsonFile(path))
  return parsed.success ? parsed.data.entries : []
}

/** 組を丸ごと書く。失敗しても例外を投げない。 */
export function writeRecommendationCache(
  entries: readonly RecommendationCacheEntry[],
  path: string = recommendationCachePath(),
): void {
  writeJsonFile(path, { v: RECOMMENDATION_CACHE_FORMAT_VERSION, entries })
}
