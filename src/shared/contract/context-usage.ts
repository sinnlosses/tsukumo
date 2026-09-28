// コンテキストの内訳の手続きの契約。
// 配るのはいまのセッションが何を積んでいるかの数と名前だけで、会話の文面は入らない。

import { oc } from "@orpc/contract"

import { contextUsageReportSchema } from "../context-usage/context-usage.ts"

export const contextUsageContract = {
  /**
   * いまのセッションのコンテキストの内訳。
   * セッションがまだ繋がっていない・取れなかったときは `unavailable`（画面ですることが同じなので、失敗のエラーにはしない）。
   */
  report: oc.output(contextUsageReportSchema),
}
