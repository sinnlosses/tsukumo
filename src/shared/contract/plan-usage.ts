// 利用枠の手続きの契約。

import { oc } from "@orpc/contract"

import { planUsageReportSchema } from "../plan-usage/plan-usage.ts"

export const planUsageContract = {
  /**
   * いまの5時間枠と7日間枠の使用状況。
   * 取れなかった・claude.ai の契約でないときは `unavailable` / `not-applicable`（画面ですることが同じなので、失敗のエラーにはしない）。
   */
  report: oc.output(planUsageReportSchema),
}
