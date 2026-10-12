// `/rpc` の要求を、oRPC の fetch 受け口へ渡す橋。

import type { IncomingMessage, ServerResponse } from "node:http"

import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch"

import { RPC_PATH } from "../../../shared/rpc.ts"
import { type RpcContext, rpcContextOf } from "./rpc-guard.ts"
import type { RpcRouter } from "./server.ts"

/**
 * `/rpc` の要求の本文の上限。手続きの入力は小さい JSON だけ（画像は `/ws` で運ぶ）なので、
 * 照合の前に大きな本文を読み込まされないように低く抑える。
 */
const RPC_MAX_BODY_BYTES = 64 * 1024

export function createRpcHandler(router: RpcRouter): RPCHandler<RpcContext> {
  return new RPCHandler(router, {
    plugins: [new BodyLimitPlugin({ maxBodySize: RPC_MAX_BODY_BYTES })],
  })
}

/**
 * `/rpc` の要求を手続きへ渡す。
 * 照合（起動トークン・`Origin`）は手続きの前のミドルウェア（`rpcGuard`）が見るので、ここは要求を写して渡し、応答を書き戻すだけ。
 * どの手続きにも当たらなければ 404。
 *
 * `@orpc/server/node` ではなく `@orpc/server/fetch` の受け口を使い、`node:http` との橋渡しをここで書く。
 * node の受け口の型宣言が壊れた型宣言（`@orpc/interop` の compression が公開物の中から CI の絶対パスを指す）を辿り、`tsc` が型宣言の中で落ちるため（`docs/research/external-dependency.md` の表1の oRPC の行）。
 */
export function serveRpc(
  request: IncomingMessage,
  response: ServerResponse,
  rpc: {
    readonly rpcHandler: RPCHandler<RpcContext>
    readonly startupToken: string
    readonly serverOrigin: string
  },
): void {
  const context = rpcContextOf(request, {
    startupToken: rpc.startupToken,
    serverOrigin: rpc.serverOrigin,
  })
  rpc.rpcHandler
    .handle(toFetchRequest(request, rpc.serverOrigin), { prefix: RPC_PATH, context })
    .then(async (result) => {
      if (!result.matched) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
        response.end("not found\n")
        return
      }
      const body = Buffer.from(await result.response.arrayBuffer())
      response.writeHead(result.response.status, {
        ...Object.fromEntries(result.response.headers),
        "cache-control": "no-store",
      })
      response.end(body)
    })
    .catch(() => {
      // 動作中の失敗で常駐プロセスを落とさない（その回だけ 500 で諦める）。
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
      }
      response.end()
    })
}

/** `node:http` の要求を fetch の `Request` に写す（本文は読み込まずに流れのまま渡す）。 */
function toFetchRequest(request: IncomingMessage, serverOrigin: string): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    for (const each of typeof value === "string" ? [value] : (value ?? [])) {
      headers.append(name, each)
    }
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  // 流れの本文には `duplex: "half"` が要る（Node の fetch）が、DOM の `RequestInit` の型には無いので、
  // 型を広げた入れ物に入れてから渡す。
  const init: RequestInit & { readonly duplex: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? bodyStreamOf(request) : undefined,
    duplex: "half",
  }
  return new Request(new URL(request.url ?? "/", serverOrigin), init)
}

/**
 * 要求の本文を fetch の流れにする。
 * 溜めずに流すので、上限（{@link RPC_MAX_BODY_BYTES}）を超えた本文は `BodyLimitPlugin` が読みながら断る。
 * `Readable.toWeb` を使わないのは、戻り値の型が `node:stream/web` の `ReadableStream` で、fetch の `BodyInit` に型の上で渡せないため。
 */
function bodyStreamOf(request: IncomingMessage): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      request.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      request.on("end", () => controller.close())
      request.on("error", (error) => controller.error(error))
    },
  })
}
