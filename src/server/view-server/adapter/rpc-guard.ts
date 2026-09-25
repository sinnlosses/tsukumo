// 手続きの口（`/rpc`）の照合。**起動トークンと `Origin` を、全部の手続きの前に1つのミドルウェアで
// 見る**（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」の表の「照合と断る条件の
// ミドルウェア」）。束ねるのは配線の `src/router.ts` で、手続きの側は照合を知らない。
//
// 規則は `/ws` の upgrade（`session-socket.ts` の `isAllowedUpgrade`）と同じ: トークンが合うこと、
// `Origin` があれば自分のオリジンと一致すること（無ければ通す。ブラウザ経由でない呼び出し）。
// 経路名は RPCHandler が照らし合わせるので、ここでは見ない。

import { type IncomingMessage } from "node:http"

import { ORPCError, os } from "@orpc/server"

import { SESSION_TOKEN_QUERY_NAME } from "../../../shared/session-socket.ts"

/**
 * 手続き1回ぶんの照合の材料。**要求から写した2つ（外の世界を写した直後なので `| undefined`）と、
 * 照らし合わせる相手の2つ**を持つ。作るのは {@link rpcContextOf}。
 */
export type RpcContext = {
  /** 要求の `?t=`。無ければ undefined。 */
  readonly presentedToken: string | undefined
  /** 要求の `Origin` ヘッダ。無ければ undefined。 */
  readonly requestOrigin: string | undefined
  /** 起動トークン（`server.ts` の `createStartupToken`）。 */
  readonly startupToken: string
  /** 自分のオリジン（`http://127.0.0.1:<port>`）。 */
  readonly serverOrigin: string
}

/** 要求1件から照合の材料を写す（`server.ts` が `/rpc` の要求ごとに呼ぶ）。 */
export function rpcContextOf(
  request: IncomingMessage,
  expected: { readonly startupToken: string; readonly serverOrigin: string },
): RpcContext {
  const url = new URL(request.url ?? "/", expected.serverOrigin)
  return {
    presentedToken: url.searchParams.get(SESSION_TOKEN_QUERY_NAME) ?? undefined,
    requestOrigin: request.headers.origin,
    startupToken: expected.startupToken,
    serverOrigin: expected.serverOrigin,
  }
}

/**
 * 照合のミドルウェア。**合わなければ 403**（`FORBIDDEN`）で、手続きの受け手は呼ばれない。
 * 理由（どちらが合わなかったか）は返さない。
 */
export const rpcGuard = os.$context<RpcContext>().middleware(({ context, next }) => {
  if (!isAllowedRpcRequest(context)) {
    throw new ORPCError("FORBIDDEN")
  }
  return next()
})

function isAllowedRpcRequest(context: RpcContext): boolean {
  if (context.presentedToken !== context.startupToken) {
    return false
  }
  return context.requestOrigin === undefined || context.requestOrigin === context.serverOrigin
}
