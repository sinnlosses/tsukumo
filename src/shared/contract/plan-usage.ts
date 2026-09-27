// 利用枠の手続きの契約（`docs/glossary.md`「契約」）。受け手は `planUsageProcedure`
// （サーバの機能 `plan-usage` の adapter）。形そのもの（型と zod）は `planUsageReportSchema`
// そのもの（下で import している）。

import { oc } from "@orpc/contract"

import { planUsageReportSchema } from "../plan-usage/plan-usage.ts"

export const planUsageContract = {
  /**
   * いまの5時間枠と7日間枠の使用状況。取れなかった・claude.ai の契約でないときは
   * `unavailable` / `not-applicable`（失敗のエラーにはしない——画面ですることが同じなので）。
   */
  report: oc.output(planUsageReportSchema),
}
