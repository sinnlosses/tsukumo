// 診断ログへブラウザの例外を書くコマンドの契約。
// 運ぶのは経路・`error.name`・スタックの先頭数フレームの行列だけで、`message` は運ばない。

import { commandBase } from "../command.ts"
import { browserErrorReportSchema } from "../diagnostic/diagnostic-record.ts"

export const diagnosticContract = {
  /** `/ws` の接続が無い間（繋ぐ前と切れている間）は送らずに捨てる。 */
  reportBrowserError: commandBase.input(browserErrorReportSchema),
}
