// コンテキストの内訳の手続き。形は `contextUsageContract`。照合は束ねる側のミドルウェアが済ませている。
// 配る中身に会話の文面は入らない（メッセージは分類1行の数としてだけ出る）。

import { implement } from "@orpc/server"

import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../shared/context-usage/context-usage.ts"
import { contextUsageContract } from "../../../shared/contract/context-usage.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type ContextUsageProcedurePorts = {
  /** いまのセッションの内訳。セッションが繋がるまでは「取れない」を返す。 */
  readonly readContextUsage: () => Promise<ContextUsageReport>
}

export function contextUsageProcedure(ports: ContextUsageProcedurePorts) {
  const procedure = implement(contextUsageContract)
  return procedure.router({
    // 取れなかった回は「取れない」をそのまま配り、失敗のエラーにはしない。
    report: procedure.report.handler(() =>
      ports.readContextUsage().catch(() => UNAVAILABLE_CONTEXT_USAGE),
    ),
  })
}
