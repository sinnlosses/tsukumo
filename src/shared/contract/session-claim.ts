// 別の窓で使用中のセッションの手続きの契約。
// 配るのは、生きているほかの tsukumo が名乗ったセッションのIDだけ（見出し・会話の中身は入らない）。

import { oc } from "@orpc/contract"
import { z } from "zod"

import { MAX_SESSION_ID_LENGTH } from "../session/session-choice.ts"

export const sessionClaimContract = {
  /** ほかの tsukumo がいま開いているセッションのID。読めなかったときは空。 */
  occupied: oc.output(z.array(z.string().min(1).max(MAX_SESSION_ID_LENGTH))),
}
