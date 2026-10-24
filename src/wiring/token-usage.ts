// トークン消費の画面の配線。記録の読み口に「今日」を決めて渡す。

import { todayLocalDateKey } from "../server/adapter/local-time.ts"
import type { TokenUsageProcedurePorts } from "../server/token-usage/adapter/token-usage-procedure.ts"
import { summarizeRecentTokenUsage } from "../server/token-usage/core/token-usage-summary.ts"
import type { TokenUsageLog } from "../server/token-usage/core/token-usage.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireTokenUsage(
  context: WiringContext,
  tokenUsageLog: TokenUsageLog,
): { readonly rpc: TokenUsageProcedurePorts } {
  return {
    rpc: {
      // 「今日」はここで決めて渡す（OS のタイムゾーンに依るので、core は今日が何日かを知らない）。
      readTokenUsageSummary: (days) =>
        summarizeRecentTokenUsage(tokenUsageLog, todayLocalDateKey(context.now), days),
    },
  }
}
