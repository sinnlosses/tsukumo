// 手続き（`/rpc`）を呼ぶ口。起動トークンは `/ws` と同じく `?t=` で付ける（照合はサーバの
// `rpcGuard`）。

import { RPC_PATH } from "../../shared/rpc.ts"
import { createRpc } from "../lib/rpc-client.ts"
import { sessionTokenUrl } from "./session-token-url.ts"

export const rpc = createRpc(() => sessionTokenUrl(RPC_PATH))
