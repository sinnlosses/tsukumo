// 診断ログへブラウザの例外を書く手続きの契約。
// 運ぶのは経路・`error.name`・スタックの先頭数フレームの行列だけで、`message` は運ばない。

import { oc } from "@orpc/contract"

import { browserErrorReportSchema } from "../diagnostic/diagnostic-record.ts"

export const diagnosticContract = {
  /** セッションの有無に関係なく常に受け付ける。 */
  reportBrowserError: oc.input(browserErrorReportSchema),
}
