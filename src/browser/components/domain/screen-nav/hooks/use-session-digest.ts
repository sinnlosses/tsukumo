// セッション1件の中身（依頼の数・要約・残り・最後のセリフ）を手続き `sessionDigest.read` で取りに行く。
//
// 取るのは頼まれた1件だけで、IDが無いあいだは取りに行かない（`skipToken`）。
// transcript は動いているセッションでは毎ターン伸びるので、取ってから 30 秒を過ぎていれば開くたびに取り直す。

import { skipToken, useQuery } from "@tanstack/react-query"

import type { SessionDigest } from "../../../../../shared/session/session-digest.ts"
import { rpc } from "../../../../domain/rpc.ts"

const DIGEST_STALE_MS = 30_000

/** まだ届いていないあいだは `loading`（「読めない」と取り違えないための区別）。 */
export type SessionDigestView = { readonly kind: "loading" } | SessionDigest

/** 取りに行く相手。`none` のあいだは取りに行かない。 */
export type SessionDigestTarget =
  | { readonly kind: "none" }
  | { readonly kind: "session"; readonly sessionId: string }

export function useSessionDigest(target: SessionDigestTarget): SessionDigestView {
  const query = useQuery(
    rpc.sessionDigest.read.queryOptions({
      input: target.kind === "none" ? skipToken : { sessionId: target.sessionId },
      staleTime: DIGEST_STALE_MS,
      retry: false,
    }),
  )

  if (query.isPending) {
    return { kind: "loading" }
  }
  return query.data ?? { kind: "unavailable" }
}
