// 別のウィンドウで使用中のセッションの手続きの契約。
// 配るのは、生きているほかの tsukumo が占有ファイルに書いたセッションのIDだけ（見出し・会話の中身は入らない）。

import { oc } from "@orpc/contract"
import { z } from "zod"

import { sessionIdSchema } from "../session/session-id.ts"

export const sessionClaimContract = {
  /** ほかの tsukumo がいま開いているセッションのID。読めなかったときは空。 */
  occupied: oc.output(z.array(sessionIdSchema)),
}
