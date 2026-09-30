// 記録済みの行を期間で切り、推移・モデル別・ツール別の軸で畳む（集計）。
// ファイルには触らず、行を読むのは読み口（`TokenUsageLog`）を受け取る `summarizeRecentTokenUsage` だけ。
// 今日が何日かは持たず、呼ぶ側が渡す。

import { groupBy, prop, sortBy, sumBy } from "remeda"

import type {
  ModelUsageTotal,
  TokenUsageDays,
  TokenUsageSummary,
  TokenUsageTotals,
  TokenUsageTrend,
  TokenUsageTrendUnit,
} from "../../../shared/token-usage/token-usage-summary.ts"
import type {
  ModelTokenUsage,
  TokenUsageRecord,
  ToolUsageCount,
} from "../../../shared/token-usage/token-usage.ts"
import { roundCost, type TokenUsageLog, type TokenUsagePeriod } from "./token-usage.ts"

/** 畳む対象が無い（期間に入る記録が無い）ときの初期値。 */
const EMPTY_TOTALS = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0,
} satisfies TokenUsageTotals

/**
 * 期間に入る行を、推移・モデル別・ツール別の3つの軸で畳む（分析画面が要る軸だけ）。
 *
 * 期間の判定は行の `at` の頭10文字（ローカル日付）で行う（記録は書いた時点のローカル日付を持つので、タイムゾーンを変換し直さない）。
 * 渡された行が期間の外を含んでいても、ここで切り直す。
 *
 * 推移の刻みは期間の長さが決める。1日なら時間ごと（0〜23時の24点）、それより長ければ日ごと。
 * 穴は0で埋める（描く側は「今日が何日か」を知らずに端のラベルを出せる）。
 */
export function summarizeTokenUsage(
  records: readonly TokenUsageRecord[],
  period: TokenUsagePeriod,
): TokenUsageSummary {
  const withinPeriod = records.filter((record) => isWithinPeriod(record, period))
  return {
    trend: summarizeTrend(withinPeriod, period),
    byModel: summarizeByModel(withinPeriod),
    byTool: summarizeByTool(withinPeriod),
  }
}

/**
 * 「今日を含む直近 `days` 日」を期間にして、記録を読んで畳む。
 * 今日が何日かはここが決めない（`endDate` を受け取る。OS のタイムゾーンに依る）。
 * 期間の両端を含むので、7日なら `endDate` の6日前から。
 */
export function summarizeRecentTokenUsage(
  log: TokenUsageLog,
  endDate: string,
  days: TokenUsageDays,
): TokenUsageSummary {
  const period = { startDate: shiftDate(endDate, -(days - 1)), endDate }
  return summarizeTokenUsage(log.readRange(period), period)
}

/**
 * ローカル日付（`YYYY-MM-DD`）を日数ぶんずらす。
 * 時刻もタイムゾーンも持ち込まずに日付だけで数えるので、夏時間のある地域でも同じ入力なら同じ境目になる。
 */
function shiftDate(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString()
}

/** 行のローカル日付が期間（両端含む）に入っているか。 */
function isWithinPeriod(record: TokenUsageRecord, period: TokenUsagePeriod): boolean {
  const date = localDateOf(record)
  return date >= period.startDate && date <= period.endDate
}

/** 行の `at` の頭10文字（ローカル日付）。ファイル名には頼らず、行だけで日付が決まる。 */
function localDateOf(record: TokenUsageRecord): string {
  return record.at.slice(0, 10)
}

/**
 * 行の `at` の12〜13文字目（ローカル時刻の時。`YYYY-MM-DDTHH:...` の `HH`）。
 * 書いた時点のローカル時刻をそのまま読むので、タイムゾーンを変換し直さない。
 */
function localHourOf(record: TokenUsageRecord): string {
  return record.at.slice(11, 13)
}

/** 1日ぶんの時の鍵（`00`〜`23`）。 */
const HOUR_KEYS: readonly string[] = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
)

/** 期間の刻み（1日だけの期間は時間ごと、それより長ければ日ごと）。 */
function trendUnitOf(period: TokenUsagePeriod): TokenUsageTrendUnit {
  return period.startDate === period.endDate ? "hour" : "day"
}

/** 期間の刻みごとに畳む。期間のすべての刻みを並べ、記録の無い刻みは0で埋める。 */
function summarizeTrend(
  records: readonly TokenUsageRecord[],
  period: TokenUsagePeriod,
): TokenUsageTrend {
  const unit = trendUnitOf(period)
  const keyOf = unit === "hour" ? localHourOf : localDateOf
  return {
    unit,
    points: trendKeys(unit, period).map((key) => ({
      key,
      totals: sumTotals(records.filter((record) => keyOf(record) === key).flatMap((r) => r.models)),
    })),
  }
}

/** 期間に並ぶ刻みの鍵（古い→新しい順）。 */
function trendKeys(unit: TokenUsageTrendUnit, period: TokenUsagePeriod): readonly string[] {
  return unit === "hour" ? HOUR_KEYS : datesInPeriod(period)
}

/** 両端を含む日付の並び（`YYYY-MM-DD`）。 */
function datesInPeriod(period: TokenUsagePeriod): readonly string[] {
  const start = Temporal.PlainDate.from(period.startDate)
  const length = start.until(Temporal.PlainDate.from(period.endDate)).days + 1
  return Array.from({ length }, (_, offset) => start.add({ days: offset }).toString())
}

/** モデルごとに畳む。並びは出力の多い順（同じならモデル名順）。 */
function summarizeByModel(records: readonly TokenUsageRecord[]): readonly ModelUsageTotal[] {
  const allUsages = records.flatMap((record) => record.models)
  const byModel = groupBy(allUsages, prop("model"))
  return sortBy(
    Object.entries(byModel).map(([model, usages]) => ({ model, totals: sumTotals(usages) })),
    [(entry) => entry.totals.outputTokens, "desc"],
    prop("model"),
  )
}

/**
 * ツールごとに畳む。メインループとサブエージェントの内訳を足し合わせる（この軸では「何にいちばん使ったか」だけを見る）。
 * 並びは「結果の長さの降順、同じなら名前順」。
 */
function summarizeByTool(records: readonly TokenUsageRecord[]): readonly ToolUsageCount[] {
  const calls = records.flatMap((record) => [
    ...record.breakdown.main.tools,
    ...record.breakdown.subagent.tools,
  ])
  const byName = groupBy(calls, prop("name"))
  return sortBy(
    Object.entries(byName).map(([name, sameName]) => ({
      name,
      calls: sumBy(sameName, prop("calls")),
      resultBytes: sumBy(sameName, prop("resultBytes")),
    })),
    [prop("resultBytes"), "desc"],
    prop("name"),
  )
}

/** モデル別の数の並びを足し合わせる（費用は浮動小数の誤差が出るので {@link roundCost} で丸める）。 */
function sumTotals(usages: readonly ModelTokenUsage[]): TokenUsageTotals {
  return usages.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      thinkingTokens: total.thinkingTokens + usage.thinkingTokens,
      cacheReadInputTokens: total.cacheReadInputTokens + usage.cacheReadInputTokens,
      cacheCreationInputTokens: total.cacheCreationInputTokens + usage.cacheCreationInputTokens,
      costUsd: roundCost(total.costUsd + usage.costUsd),
    }),
    EMPTY_TOTALS,
  )
}
