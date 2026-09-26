// コンテキストの内訳の手続きの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/context-usage/adapter/context-usage-procedure.ts`。形そのもの（内訳の型と zod）は
// `src/shared/context-usage.ts`。
//
// 配るのはいまのセッションが何を積んでいるかの数と名前だけで、会話の文面は入らない
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { oc } from "@orpc/contract"

import { contextUsageReportSchema } from "../context-usage.ts"

export const contextUsageContract = {
  /**
   * いまのセッションのコンテキストの内訳。セッションがまだ繋がっていない・取れなかったときは
   * 「取れない」（`unavailable`。失敗のエラーにはしない——画面ですることが同じなので）。
   */
  report: oc.output(contextUsageReportSchema),
}
