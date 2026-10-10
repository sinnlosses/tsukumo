// 選んでいるセッションの中身の手続きの契約。
//
// 一覧（`sessions-changed`）には軽いもの（ID・見出し・時刻）だけを載せ、transcript を読まないと
// 出せないもの（依頼の数・要約・最後のセリフ）は、切り替え画面で選んだ1件の分だけここで取りに来る。
// 配るのは切り替え先の一覧に載ったセッションと、いま出しているセッションの分だけ。

import { oc } from "@orpc/contract"
import { z } from "zod"

import { MAX_SESSION_ID_LENGTH } from "../session/session-choice.ts"
import { sessionDigestSchema } from "../session/session-digest.ts"

export const sessionDigestContract = {
  /** セッション1件の中身。読めなかった・一覧に無いIDは `unavailable`（失敗のエラーにはしない）。 */
  read: oc
    .input(z.object({ sessionId: z.string().min(1).max(MAX_SESSION_ID_LENGTH) }))
    .output(sessionDigestSchema),
}
