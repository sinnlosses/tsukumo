// 利用枠の手続き（`docs/glossary.md`「利用枠」）。形は `planUsageContract`、束ねるのは配線。
// 照合は束ねる側のミドルウェアが済ませている。

import { implement } from "@orpc/server"

import { planUsageContract } from "../../../shared/contract/plan-usage.ts"
import {
  type PlanUsageReport,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../shared/plan-usage/plan-usage.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type PlanUsageProcedurePorts = {
  /**
   * いまのセッションの利用枠（持ち主は `session-manager` の `readPlanUsage`。セッションが
   * 繋がるまでは「取れない」を返すものを配線が置く）。
   */
  readonly readPlanUsage: () => Promise<PlanUsageReport>
}

export function planUsageProcedure(ports: PlanUsageProcedurePorts) {
  const procedure = implement(planUsageContract)
  return procedure.router({
    // 駆動へ問い合わせるので応答を待つが、取れなかった回は「取れない」をそのまま配る
    // （画面は一言だけ出す。失敗のエラーにはしない）。
    report: procedure.report.handler(() =>
      ports.readPlanUsage().catch(() => UNAVAILABLE_PLAN_USAGE),
    ),
  })
}
