// コンテキストの内訳の手続き（`docs/glossary.md`「手続き」）。形は
// `src/shared/contract/context-usage.ts`、束ねるのは配線の `src/router.ts`。照合は束ねる側の
// ミドルウェアが済ませている。配る中身に会話の文面は入らない — メッセージは分類1行の数として
// だけ出る（`src/shared/context-usage.ts`）。

import { implement } from "@orpc/server"

import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../shared/context-usage.ts"
import { contextUsageContract } from "../../../shared/contract/context-usage.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type ContextUsageProcedurePorts = {
  /**
   * いまのセッションの内訳（持ち主は `session-manager` の `readContextUsage`。セッションが
   * 繋がるまでは「取れない」を返すものを配線が置く）。
   */
  readonly readContextUsage: () => Promise<ContextUsageReport>
}

export function contextUsageProcedure(ports: ContextUsageProcedurePorts) {
  const procedure = implement(contextUsageContract)
  return procedure.router({
    // 駆動へ問い合わせるので応答を待つが、取れなかった回は「取れない」をそのまま配る
    // （画面は一言だけ出す。失敗のエラーにはしない）。
    report: procedure.report.handler(() =>
      ports.readContextUsage().catch(() => UNAVAILABLE_CONTEXT_USAGE),
    ),
  })
}
