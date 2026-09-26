// トークン消費の手続き（`docs/glossary.md`「手続き」）。形は `src/shared/contract/token-usage.ts`、
// 束ねるのは配線の `src/router.ts`。照合は束ねる側のミドルウェアが済ませている。
// 配る中身に文面は入らない（記録の1行にそもそも口が無い）。

import { implement } from "@orpc/server"

import { tokenUsageContract } from "../../../shared/contract/token-usage.ts"
import { type TokenUsageDays, type TokenUsageSummary } from "../../../shared/token-usage-summary.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type TokenUsageProcedurePorts = {
  /**
   * 今日を含む直近 `days` 日の集計（`core/token-usage.ts` の `summarizeRecentTokenUsage` を記録の
   * 読み口と今日に束ねたもの）。読めない・記録が無いときは空の集計を返す契約。
   */
  readonly readTokenUsageSummary: (days: TokenUsageDays) => TokenUsageSummary
}

export function tokenUsageProcedure(ports: TokenUsageProcedurePorts) {
  const procedure = implement(tokenUsageContract)
  return procedure.router({
    summary: procedure.summary.handler(({ input }) => ports.readTokenUsageSummary(input.days)),
  })
}
