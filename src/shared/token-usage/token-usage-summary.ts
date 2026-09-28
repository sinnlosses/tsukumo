// トークン消費の集計（期間で切って軸ごとに畳んだ形）の受け渡しの形。
// 運ぶのは数・モデルの名前・ツールの名前だけ（記録の1行にそもそも文面が入らないので、畳んだ結果にも入りようがない）。

import { z } from "zod"

import type { ModelTokenUsage, ToolUsageCount } from "./token-usage.ts"

/**
 * 選べる期間（今日を含む直近何日か）。
 * 1日は「いま何に食われているか」（棒が時間ごとに割れる）、7日は「先週はどうだったか」、30日は「均すとどうか」を見る。
 */
export const TOKEN_USAGE_DAYS_CHOICES = [1, 7, 30] as const

/** {@link TOKEN_USAGE_DAYS_CHOICES} のどれか。 */
export type TokenUsageDays = (typeof TOKEN_USAGE_DAYS_CHOICES)[number]

/** 期間の長さ（{@link TOKEN_USAGE_DAYS_CHOICES} のどれか。手続きの入力）。 */
export const tokenUsageDaysSchema = z.literal(TOKEN_USAGE_DAYS_CHOICES)

/** 既定の期間。まず「この1週間」を見せる（日ごとの棒が読める幅に収まる長さでもある）。 */
export const DEFAULT_TOKEN_USAGE_DAYS = 7 satisfies TokenUsageDays

/** モデル別の数から `model` を除いた形（日ごと・モデル別のどちらでも同じ数の並びを使う）。 */
export type TokenUsageTotals = Omit<ModelTokenUsage, "model">

/** 推移の棒1本ぶんの刻み（{@link TokenUsageTrend} の `unit`）。 */
export type TokenUsageTrendUnit = "day" | "hour"

/**
 * 推移の1点（棒1本）。
 * `key` は刻みに応じた機械の側の鍵で、`unit` が `"day"` ならローカル日付（`YYYY-MM-DD`）、`"hour"` ならローカル時刻の時（`00`〜`23`）。
 * 人に見せる書き方を決めるのは描く側。
 */
export type TokenUsageTrendPoint = {
  readonly key: string
  readonly totals: TokenUsageTotals
}

/**
 * 期間の推移。`points` は期間のすべての刻みを古い→新しい順に並べる（記録が無い刻みも 0 の点として入る）。
 * ブラウザは「今日が何日か」を知らないので、穴を埋めるのはサーバの畳む側。
 */
export type TokenUsageTrend = {
  readonly unit: TokenUsageTrendUnit
  readonly points: readonly TokenUsageTrendPoint[]
}

/** あるモデル1つの合計。 */
export type ModelUsageTotal = {
  readonly model: string
  readonly totals: TokenUsageTotals
}

/** 期間で切った記録を畳んだ結果。分析の画面が要る3つの軸だけ（日ごと・モデル別・ツール別）を持つ。 */
export type TokenUsageSummary = {
  /** 期間の推移（刻みは期間の長さで決まる。穴は0で埋まっている）。 */
  readonly trend: TokenUsageTrend
  /** モデルごとの合計（出力の多い順、同じならモデル名順）。 */
  readonly byModel: readonly ModelUsageTotal[]
  /** ツールごとの合計（結果の長さの降順、同じなら名前順）。 */
  readonly byTool: readonly ToolUsageCount[]
}

/**
 * 記録が1件も無い期間の集計（3つの軸がどれも空）。
 * 取れなかったときの置き換えにも使うので、推移の刻みは期間を知らないまま既定の `"day"` になる（点が無いので刻みは画面に出ない）。
 */
export const EMPTY_TOKEN_USAGE_SUMMARY = {
  trend: { unit: "day", points: [] },
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
export const tokenUsageSummarySchema = z.object({
  trend: z.object({
    unit: z.enum(["day", "hour"]),
    points: z.array(z.object({ key: z.string(), totals: tokenUsageTotalsSchema })).readonly(),
  }),
  byModel: z.array(z.object({ model: z.string(), totals: tokenUsageTotalsSchema })).readonly(),
  byTool: z
    .array(z.object({ name: z.string(), calls: z.number(), resultBytes: z.number() }))
    .readonly(),
})
