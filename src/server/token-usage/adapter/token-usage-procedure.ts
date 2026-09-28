// トークン消費の手続き。形は `tokenUsageContract`。照合は束ねる側のミドルウェアが済ませている。
// 配る中身に文面は入らない（記録の1行にそもそも口が無い）。

import { implement } from "@orpc/server"

import { tokenUsageContract } from "../../../shared/contract/token-usage.ts"
import type {
  TokenUsageDays,
  TokenUsageSummary,
} from "../../../shared/token-usage/token-usage-summary.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type TokenUsageProcedurePorts = {
  /** 今日を含む直近 `days` 日の集計。読めない・記録が無いときは空の集計を返す。 */
  readonly readTokenUsageSummary: (days: TokenUsageDays) => TokenUsageSummary
}

export function tokenUsageProcedure(ports: TokenUsageProcedurePorts) {
  const procedure = implement(tokenUsageContract)
  return procedure.router({
    summary: procedure.summary.handler(({ input }) => ports.readTokenUsageSummary(input.days)),
  })
}
