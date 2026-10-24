// 手続き（`/rpc`）を呼ぶ型付きの口。起動トークンは `/ws` と同じく `?t=` で付ける（照合はサーバの
// `rpcGuard`）。型は `rpcContract` から導く（ブラウザはサーバの型を import しない）。
//
// `fetch` も呼ぶたびに引く（`RPCLink` は既定では作った時点の `globalThis.fetch` を握る）。
// client はモジュールに1つだけ置くので、握ったままだとページが後から差し替えた `fetch` を使わない。

import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"

import { RPC_PATH, type RpcClient } from "../../shared/rpc.ts"
import { sessionTokenUrl } from "./session-token-url.ts"

export const rpc = createRpc(() => sessionTokenUrl(RPC_PATH))

// 手続きごとの `queryOptions` / `key` を持つ口を作る。`path` は呼ぶたびに引き、今のページの URL を基準に解決する。
function createRpc(path: () => string) {
  const rpcLink = new RPCLink({
    url: () => new URL(path(), window.location.href).href,
    fetch: (request, init) => globalThis.fetch(request, init),
  })
  const rpcClient: RpcClient = createORPCClient(rpcLink)
  return createTanstackQueryUtils(rpcClient)
}
