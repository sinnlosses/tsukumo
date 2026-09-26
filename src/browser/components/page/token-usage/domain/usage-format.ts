// トークン消費の画面に出す期間の合計と、バイト数の書き方。表の桁を揃えて横幅を食わせない
// ための畳み方だけを持つ（合計は `hooks/use-token-usage.ts` が呼び、書き方は
// `presentational-token-usage.tsx` が呼ぶ）。トークン数の書き方（`formatCount`）は
// `browser/utils/format-count.ts` へ上げてある（サイドバーの使用量の行と2つの機能が
// 読むようになったため）。
//
// 数のほかは扱わない — ここに来るのはトークン数・バイト数・モデルの名前だけで、
// 会話の文面は集計にそもそも入っていない（`src/shared/token-usage-summary.ts`）。
// `costUsd`（USD建てのコスト）はここでは書き方を持たない（画面に出さない。記録と集計の
// 形自体は `src/shared/token-usage.ts` / `src/shared/token-usage-summary.ts` に残る）。

import {
  type ModelUsageTotal,
  type TokenUsageTotals,
} from "../../../../../shared/token-usage-summary.ts"
import { round } from "../../../../utils/format-count.ts"

/** 合計する対象が無いときの値（`src/server/token-usage/core/token-usage.ts` の `EMPTY_TOTALS` と同じ並び）。 */
const EMPTY_TOTALS = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0,
} satisfies TokenUsageTotals

/**
 * 期間の合計。モデル別の並びを足し合わせる（日ごとを足しても同じ数になるが、モデル別の
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
 * 結果の長さ（バイト数）。単位は KB / MB（1024 刻み。桁の詰め方は
 * `browser/utils/format-count.ts` の `formatCount` と同じ `round` を使う）。
 */
export function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${round(value / (1024 * 1024))} MB`
  }
  if (value >= 1024) {
    return `${round(value / 1024)} KB`
  }
  return `${value} B`
}
