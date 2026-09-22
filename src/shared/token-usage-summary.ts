// トークン消費の集計（期間で切って軸ごとに畳んだ形）と、それを配る経路の名前。**サーバ
// （`src/server/adapter/server.ts` が配る）とブラウザ（分析の画面が取りに行く）の両方が同じ値を
// 見る**ので shared に置く（`repository-file.ts` と同じ考え方。ここは値と型だけで `node:` にも
// `document` にも触らない）。
//
// **畳むのは `src/server/core/token-usage.ts`**（純関数）、**行を読むのは
// `src/server/adapter/token-usage-log.ts`** で、ここが持つのは受け渡しの形だけ。
//
// **運ぶのは数・モデルの名前・ツールの名前だけ**（`src/shared/token-usage.ts` と同じ線。
// 記録の1行にそもそも文面が入らないので、畳んだ結果にも入りようがない。
// `docs/coding-standards.md`「会話内容の扱い」）。
//
// **起動トークンが要る経路**（`/repository-file` と同じ形で `?t=` を付ける）。配るのは利用者が
// 何にいくら使ったかで、同梱物や素材と違って誰にでも配ってよい静的な物ではない。

import { z } from "zod"

import { type ModelTokenUsage, type ToolUsageCount } from "./token-usage.ts"

/** 集計の経路（`GET /token-usage?t=<起動トークン>&days=<日数>`）。 */
export const TOKEN_USAGE_SUMMARY_PATH = "/token-usage"

/** 期間の長さ（日数）を載せるクエリの名前。 */
export const TOKEN_USAGE_DAYS_QUERY_NAME = "days"

/**
 * 選べる期間（今日を含む直近何日か）。**2つだけ**にしてあるのは、「先週はどうだったか」と
 * 「均すとどうか」で見たいものが変わるのがこの2段しかないため（1日・90日は、どちらも
 * 減らす判断が変わらない）。
 */
export const TOKEN_USAGE_DAYS_CHOICES = [7, 30] as const

/** {@link TOKEN_USAGE_DAYS_CHOICES} のどれか。 */
export type TokenUsageDays = (typeof TOKEN_USAGE_DAYS_CHOICES)[number]

/** 既定の期間。**まず「この1週間」を見せる**（日ごとの棒が読める幅に収まる長さでもある）。 */
export const DEFAULT_TOKEN_USAGE_DAYS = 7 satisfies TokenUsageDays

/** モデル別の数から `model` を除いた形（日ごと・モデル別のどちらでも同じ数の並びを使う）。 */
export type TokenUsageTotals = Omit<ModelTokenUsage, "model">

/** ある1日（ローカル日付）の合計。 */
export type DailyTokenUsage = {
  readonly date: string
  readonly totals: TokenUsageTotals
}

/** あるモデル1つの合計。 */
export type ModelUsageTotal = {
  readonly model: string
  readonly totals: TokenUsageTotals
}

/**
 * 期間で切った記録を畳んだ結果（`summarizeTokenUsage` の戻り値）。**分析の画面が要る3つの軸
 * だけ**（日ごと・モデル別・ツール別）を持つ。
 */
export type TokenUsageSummary = {
  /** 日ごとの合計（期間に入る日だけを古い→新しい順に並べる。記録が無い日は含まない）。 */
  readonly byDay: readonly DailyTokenUsage[]
  /** モデルごとの合計（モデル名の昇順）。 */
  readonly byModel: readonly ModelUsageTotal[]
  /** ツールごとの合計（結果の長さの降順、同じなら名前順）。 */
  readonly byTool: readonly ToolUsageCount[]
}

/** 記録が1件も無い期間の集計（3つの軸がどれも空）。 */
export const EMPTY_TOKEN_USAGE_SUMMARY = {
  byDay: [],
  byModel: [],
  byTool: [],
} satisfies TokenUsageSummary

/** 合計の数の並び（{@link TokenUsageTotals} と同じ鍵）。 */
const tokenUsageTotalsSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  thinkingTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  costUsd: z.number(),
})

/** 配る形そのもの（{@link TokenUsageSummary} と同じ鍵）。 */
const tokenUsageSummarySchema = z.object({
  byDay: z.array(z.object({ date: z.string(), totals: tokenUsageTotalsSchema })),
  byModel: z.array(z.object({ model: z.string(), totals: tokenUsageTotalsSchema })),
  byTool: z.array(z.object({ name: z.string(), calls: z.number(), resultBytes: z.number() })),
})

/**
 * クエリの `days` を期間の長さとして読む。**選べる値でなければ既定に落とす**（数として読めない
 * ときも同じ。呼ぶ側が書き間違えても画面は出る）。
 */
export function readTokenUsageDays(value: string | undefined): TokenUsageDays {
  const found = TOKEN_USAGE_DAYS_CHOICES.find((days) => String(days) === value)
  return found ?? DEFAULT_TOKEN_USAGE_DAYS
}

/**
 * 届いた JSON を集計として読む。**読めない形のときは空の集計**（`readRepositoryFileList` と
 * 同じ割り切り。画面は「記録が無い期間」と同じ見た目になるだけで落ちない）。
 */
export function readTokenUsageSummary(value: unknown): TokenUsageSummary {
  const parsed = tokenUsageSummarySchema.safeParse(value)
  return parsed.success ? parsed.data : EMPTY_TOKEN_USAGE_SUMMARY
}
