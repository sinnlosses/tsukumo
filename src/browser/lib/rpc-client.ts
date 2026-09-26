// 手続き（`/rpc`）を呼ぶ型付きの client と、TanStack Query に渡す口。型は `src/shared/rpc.ts` の
// `rpcContract` から導く（ブラウザはサーバの型を import しない）。
//
// 起動トークンは `/ws` と同じく `?t=` で付ける（`lib/session-token-url.ts`。照合はサーバの
// `rpc-guard.ts`）。URL は呼ぶたびに今のページから組み立てる。
//
// `fetch` も呼ぶたびに引く（`RPCLink` は既定では作った時点の `globalThis.fetch` を握る）。この
// client はモジュールに1つだけ置くので、握ったままだとページが後から差し替えた `fetch` を使わない。

import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"

import { RPC_PATH, type RpcClient } from "../../shared/rpc.ts"
import { sessionTokenUrl } from "./session-token-url.ts"

const rpcLink = new RPCLink({
  url: () => new URL(sessionTokenUrl(RPC_PATH), window.location.href).href,
  fetch: (request, init) => globalThis.fetch(request, init),
})

const rpcClient: RpcClient = createORPCClient(rpcLink)

/**
 * 手続きごとの `queryOptions` / `key` を持つ口（`rpc.tokenUsage.summary.queryOptions({ input })`
 * のように、契約の名前をそのまま辿る）。
 */
export const rpc = createTanstackQueryUtils(rpcClient)
