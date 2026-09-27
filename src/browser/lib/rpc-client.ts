// 手続き（`/rpc`）を呼ぶ型付きの client と、TanStack Query に渡す口を作る。型は `src/shared/rpc.ts` の
// `rpcContract` から導く（ブラウザはサーバの型を import しない）。
//
// `fetch` も呼ぶたびに引く（`RPCLink` は既定では作った時点の `globalThis.fetch` を握る）。
// client はモジュールに1つだけ置くので、握ったままだとページが後から差し替えた `fetch` を使わない。

import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"

import type { RpcClient } from "../../shared/rpc.ts"

/**
 * 手続きごとの `queryOptions` / `key` を持つ口を作る（`rpc.tokenUsage.summary.queryOptions({ input })`
 * のように、契約の名前をそのまま辿る）。`path` は呼ぶたびに引き、今のページの URL を基準に解決する。
 */
export function createRpc(path: () => string) {
  const rpcLink = new RPCLink({
    url: () => new URL(path(), window.location.href).href,
    fetch: (request, init) => globalThis.fetch(request, init),
  })
  const rpcClient: RpcClient = createORPCClient(rpcLink)
  return createTanstackQueryUtils(rpcClient)
}
