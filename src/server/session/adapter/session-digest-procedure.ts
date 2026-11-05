// 選んでいるセッションの中身の手続き。形は `sessionDigestContract`。
// 照合は束ねる側のミドルウェアが済ませている。
// どのIDなら読んでよいかは読み口（`readSessionDigest`）が決めるので、ここでは絞らない。

import { implement } from "@orpc/server"

import { sessionDigestContract } from "../../../shared/contract/session-digest.ts"
import {
  type SessionDigest,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../shared/session/session-digest.ts"
import type { SessionId } from "../../../shared/session/session-id.ts"

/** この機能の手続きが使う関数（中身は配線が渡す）。 */
export type SessionDigestProcedurePorts = {
  /** セッション1件の中身。セッションが繋がるまでは「読めない」を返す。 */
  readonly readSessionDigest: (sessionId: SessionId) => Promise<SessionDigest>
}

export function sessionDigestProcedure(ports: SessionDigestProcedurePorts) {
  const procedure = implement(sessionDigestContract)
  return procedure.router({
    // 読めなかった回は「読めない」をそのまま配る（画面は右の欄を空にするだけ。失敗のエラーにはしない）。
    read: procedure.read.handler(({ input }) =>
      ports.readSessionDigest(input.sessionId).catch(() => UNAVAILABLE_SESSION_DIGEST),
    ),
  })
}
