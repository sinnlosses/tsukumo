// トークン消費の画面に出す期間の合計と、バイト数の書き方。
//
// 数のほかは扱わない。
// ここに来るのはトークン数・バイト数・モデルの名前だけで、会話の文面は集計にそもそも入っていない（`TokenUsageSummary`）。
// `costUsd`（USD建てのコスト）は画面に出さないので、ここでは書き方を持たない。

import type {
  ModelUsageTotal,
  TokenUsageTotals,
} from "../../../../../shared/token-usage/token-usage-summary.ts"
import { round } from "../../../../utils/format-count.ts"

/** 合計する対象が無いときの値。 */
const EMPTY_TOTALS = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costUsd: 0,
} satisfies TokenUsageTotals

/** 期間の合計。モデル別の並びを足し合わせる。 */
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

/** 結果の長さ（バイト数）。単位は KB / MB（1024 刻み）。 */
export function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${round(value / (1024 * 1024))} MB`
  }
  if (value >= 1024) {
    return `${round(value / 1024)} KB`
  }
  return `${value} B`
}
