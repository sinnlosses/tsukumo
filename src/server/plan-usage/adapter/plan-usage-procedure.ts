// 利用枠の手続き。形は `planUsageContract`。照合は束ねる側のミドルウェアが済ませている。

import { implement } from "@orpc/server"

import { planUsageContract } from "../../../shared/contract/plan-usage.ts"
import {
  type PlanUsageReport,
  UNAVAILABLE_PLAN_USAGE,
} from "../../../shared/plan-usage/plan-usage.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type PlanUsageProcedurePorts = {
  /** いまのセッションの利用枠。セッションが繋がるまでは「取れない」を返す。 */
  readonly readPlanUsage: () => Promise<PlanUsageReport>
}

export function planUsageProcedure(ports: PlanUsageProcedurePorts) {
  const procedure = implement(planUsageContract)
  return procedure.router({
    // 取れなかった回は「取れない」をそのまま配り、失敗のエラーにはしない。
    report: procedure.report.handler(() =>
      ports.readPlanUsage().catch(() => UNAVAILABLE_PLAN_USAGE),
    ),
  })
}
