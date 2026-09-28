// トークン消費の手続きの契約。
// 配るのは利用者が何にいくら使ったかで、文面は入らない（記録の1行にそもそも口が無い）。

import { oc } from "@orpc/contract"
import { z } from "zod"

import {
  tokenUsageDaysSchema,
  tokenUsageSummarySchema,
} from "../token-usage/token-usage-summary.ts"

export const tokenUsageContract = {
  /** 今日を含む直近 `days` 日の集計。 */
  summary: oc.input(z.object({ days: tokenUsageDaysSchema })).output(tokenUsageSummarySchema),
}
