// セッション1件の中身（依頼の数・要約・最後のセリフ）を手続き `sessionDigest.read` で取りに行く
// （`docs/glossary.md`「セッションの要約」）。
//
// 取るのは頼まれた1件だけで、IDが無いあいだは取りに行かない（`skipToken`）。transcript は
// 動いているセッションでは毎ターン伸びるので、開くたびに取り直す（`staleTime: 0`）。

import { skipToken, useQuery } from "@tanstack/react-query"

import type { SessionDigest } from "../../../../../shared/session-digest.ts"
import { rpc } from "../../../../domain/rpc.ts"

/** まだ届いていないあいだは `loading`（「読めない」と取り違えないための区別）。 */
export type SessionDigestView = { readonly kind: "loading" } | SessionDigest

export function useSessionDigest(sessionId: string | undefined): SessionDigestView {
  const query = useQuery(
    rpc.sessionDigest.read.queryOptions({
      input: sessionId === undefined ? skipToken : { sessionId },
      staleTime: 0,
      retry: false,
    }),
  )

  if (query.isPending) {
    return { kind: "loading" }
  }
  return query.data ?? { kind: "unavailable" }
}
