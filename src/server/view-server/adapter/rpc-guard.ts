// 手続きの照合と断る条件（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」の表の「照合と
// 断る条件のミドルウェア」）。起動トークンと `Origin` を全部の手続きの前に1つのミドルウェアで
// 見て（`/rpc` と `/ws` の両方）、コマンドはさらに契約の `meta` の断る条件を見る。束ねるのは
// 配線の `src/router.ts` で、手続きの側は照合も断る条件も知らない。
//
// 規則は `/ws` の upgrade（`session-socket.ts` の `isAllowedUpgrade`）と同じ: トークンが合うこと、
// `Origin` があれば自分のオリジンと一致すること（無ければ通す。ブラウザ経由でない呼び出し）。
// 経路名は RPCHandler が照らし合わせるので、ここでは見ない。

import { type IncomingMessage } from "node:http"

import { ORPCError, os } from "@orpc/server"

import { COMMAND_ERRORS, type CommandMeta, NO_COMMAND_REFUSAL } from "../../../shared/command.ts"
import { SESSION_TOKEN_QUERY_NAME } from "../../../shared/session-socket.ts"
import { type SessionState } from "../../../shared/session-state.ts"
import { type CommandSession } from "../../session/core/command-session.ts"
import { type SubscribeFrames } from "./frame-procedure.ts"

/**
 * 手続き1回ぶんの照合の材料。要求から写した2つ（外の世界を写した直後なので `| undefined`）と、
 * 照らし合わせる相手の2つを持つ。作るのは {@link rpcContextOf}。
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

/**
 * コマンドの手続き1回ぶんの材料。照合の材料に、いまのセッションの口を足したもの（`/ws` の
 * 接続ごとに `session-socket.ts` が作る）。`session` の手続きはこれを受け手へ渡し、葉の機能の
 * 手続きはそのうち `emit` だけを見る。
 */
export type CommandRpcContext = RpcContext & { readonly session: CommandSession }

/**
 * `/ws` の手続き1回ぶんの材料。コマンドの材料に、押し出しの購読の元（`frame.subscribe` が
 * 読む）を足したもの。
 */
export type SocketRpcContext = CommandRpcContext & { readonly subscribe: SubscribeFrames }

/** 要求1件から照合の材料を写す（`server.ts` が `/rpc` の要求ごとに、`session-socket.ts` が接続ごとに呼ぶ）。 */
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
 * 照合のミドルウェア。合わなければ 403（`FORBIDDEN`）で、手続きの受け手は呼ばれない。
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

/**
 * 断る条件のミドルウェア。契約の `meta`（`src/shared/command.ts` の `CommandMeta`）を見て、
 * 当たれば定型文の理由を添えた `REFUSED` を返し、手続きの受け手は呼ばれない。見る順は
 * 「雑談の外か」→「ターン中か」——仕事のときに押された `nudge` にターン中の理由を返さないため。
 *
 * 画面も同じ条件で操作子を塞ぐが、ここでも見る（画面を経ない依頼・無効化の描画が間に合わなかった
 * ときの取りこぼし対策）。
 */
export const commandGuard = os
  .$context<{ readonly session: { readonly state: () => SessionState } }>()
  .$meta<CommandMeta>(NO_COMMAND_REFUSAL)
  .errors(COMMAND_ERRORS)
  .middleware(({ context, procedure, errors, next }) => {
    const reason = refusalOf(procedure["~orpc"].meta, context.session.state())
    if (reason !== undefined) {
      throw errors.REFUSED({ data: { reason } })
    }
    return next()
  })

/** 断る理由（断らないなら undefined）。 */
function refusalOf(meta: CommandMeta, state: SessionState): string | undefined {
  if (!state.chatMode && meta.chatOnly !== false) {
    return meta.chatOnly
  }
  if (state.turn.kind === "running" && meta.idleTurn !== false) {
    return meta.idleTurn
  }
  return undefined
}
