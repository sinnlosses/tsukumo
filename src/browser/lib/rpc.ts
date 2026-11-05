// 手続き（`/rpc`）を呼ぶ型付きの口。型は `rpcContract` から導く（ブラウザはサーバの型を import しない）。
// 起動トークンを付けた URL と `fetch` は呼ぶ側が渡す（照合はサーバの `rpcGuard`）。

import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"

import type { RpcClient } from "../../shared/rpc.ts"

export type RpcEnvironment = {
  /** 手続きの絶対 URL（起動トークン付き）。 */
  readonly resolveUrl: () => string
  readonly fetch: (request: Request, init: RequestInit | undefined) => Promise<Response>
}

/** 手続きごとの `queryOptions` / `key` を持つ口。 */
export type Rpc = ReturnType<typeof createRpc>

export function createRpc(environment: RpcEnvironment) {
  const rpcLink = new RPCLink({
    url: environment.resolveUrl,
    fetch: environment.fetch,
  })
  const rpcClient: RpcClient = createORPCClient(rpcLink)
  return createTanstackQueryUtils(rpcClient)
}
