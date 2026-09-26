// トークン消費の手続きの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/token-usage/adapter/token-usage-procedure.ts`。形そのもの（集計の型と zod）は
// `src/shared/token-usage-summary.ts`。
//
// 配るのは利用者が何にいくら使ったかで、配る中身に文面は入らない（記録の1行にそもそも口が無い。
// `docs/coding-standards.md`「会話内容の扱い」）。

import { oc } from "@orpc/contract"
import { z } from "zod"

import { tokenUsageDaysSchema, tokenUsageSummarySchema } from "../token-usage-summary.ts"

export const tokenUsageContract = {
  /** 今日を含む直近 `days` 日の集計（分析の画面と、見直しの段の右の数が読む）。 */
  summary: oc.input(z.object({ days: tokenUsageDaysSchema })).output(tokenUsageSummarySchema),
}
