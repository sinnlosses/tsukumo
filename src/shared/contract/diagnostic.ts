// 診断ログへブラウザの例外と札の押下を書くコマンドの契約。
// 運ぶのは経路・`error.name`・スタックの先頭数フレームの行列と、押した札の種類だけで、`message` は運ばない。

import { z } from "zod"

import { commandBase } from "../command.ts"
import { browserErrorReportSchema } from "../diagnostic/diagnostic-record.ts"
import { RECOMMENDATION_CARD_KINDS } from "../recommendation/recommendation-card.ts"

export const diagnosticContract = {
  /** `/ws` の接続が無い間（繋ぐ前と切れている間）は送らずに捨てる。 */
  reportBrowserError: commandBase.input(browserErrorReportSchema),
  /** 始め方の札が押されたこと。押した札の種類だけを送り、依頼そのものは `session.prompt` で送る。 */
  reportRecommendationPressed: commandBase.input(
    z.object({ kind: z.enum(RECOMMENDATION_CARD_KINDS) }),
  ),
}
