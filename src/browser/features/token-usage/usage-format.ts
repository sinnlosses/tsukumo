// トークン消費の画面に出す数の書き方と、期間の合計。**表の桁を揃えて横幅を食わせない**ための
// 畳み方だけを持つ（合計は `hooks/use-token-usage.ts` が呼び、書き方は
// `presentational-token-usage-screen.tsx` が呼ぶ）。
//
// **数のほかは扱わない** — ここに来るのはトークン数・バイト数・モデルの名前だけで、
// 会話の文面は集計にそもそも入っていない（`src/shared/token-usage-summary.ts`）。
// **`costUsd`（USD建てのコスト）はここでは書き方を持たない**（画面に出さない。記録と集計の
// 形自体は `src/shared/token-usage.ts` / `src/shared/token-usage-summary.ts` に残る）。

import { type ModelUsageTotal, type TokenUsageTotals } from "../../../shared/token-usage-summary.ts"

/** 合計する対象が無いときの値（`src/server/core/token-usage.ts` の `EMPTY_TOTALS` と同じ並び）。 */
const EMPTY_TOTALS = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0,
} satisfies TokenUsageTotals

/**
 * 期間の合計。**モデル別の並びを足し合わせる**（日ごとを足しても同じ数になるが、モデル別の
 * ほうが「期間に居たモデル」と並べて読めるので、同じ出どころから取る）。
 */
export function totalUsage(byModel: readonly ModelUsageTotal[]): TokenUsageTotals {
  return byModel.reduce(
    (total, entry) => ({
      inputTokens: total.inputTokens + entry.totals.inputTokens,
      outputTokens: total.outputTokens + entry.totals.outputTokens,
      thinkingTokens: total.thinkingTokens + entry.totals.thinkingTokens,
      cacheReadInputTokens: total.cacheReadInputTokens + entry.totals.cacheReadInputTokens,
      cacheCreationInputTokens:
        total.cacheCreationInputTokens + entry.totals.cacheCreationInputTokens,
      costUsd: total.costUsd + entry.totals.costUsd,
    }),
    EMPTY_TOTALS,
  )
}

/**
 * トークン数（`1234567` → `1.23M`）。**3桁までに丸めて単位を付ける** — 表の桁が揃わないと
 * 大小が読めず、素の桁数だと列が広がって横に溢れる。1000 未満はそのまま。
 */
export function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${round(value / 1_000_000)}M`
  }
  if (value >= 1000) {
    return `${round(value / 1000)}k`
  }
  return String(value)
}

/** 結果の長さ（バイト数）。単位は KB / MB（1024 刻み。桁の詰め方は {@link formatCount} と同じ）。 */
export function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${round(value / (1024 * 1024))} MB`
  }
  if (value >= 1024) {
    return `${round(value / 1024)} KB`
  }
  return `${value} B`
}

/** 有効数字3桁のつもりで小数第2位まで（`1.23` / `12.3` / `123`）。 */
function round(value: number): string {
  if (value >= 100) {
    return value.toFixed(0)
  }
  return value >= 10 ? value.toFixed(1) : value.toFixed(2)
}
