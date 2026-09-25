// 全機能の手続きを1枚に束ねる（配線。`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
// **「どの手続きをどの機能が受けるか」の答えはこのファイル**で、手続きの中身も照合の判定も書かない
// （名前と手続きの対応と、全部の前に掛ける照合のミドルウェアだけ）。
//
// 束ねるのを配線に置くのは `src/command-route.ts` と同じ理由で、機能どうしの辺の表を増やさないため
// （葉の機能の手続きが読むのは `shared` と自分の機能だけ）。形（名前と入出力）は
// `src/shared/rpc.ts` の `rpcContract` が正典で、ここはそれに受け手を付ける。

import { implement } from "@orpc/server"

import {
  type AchievementProcedurePorts,
  achievementProcedure,
} from "./server/achievement/adapter/achievement-procedure.ts"
import {
  type ContextUsageProcedurePorts,
  contextUsageProcedure,
} from "./server/context-usage/adapter/context-usage-procedure.ts"
import {
  type RepositoryProcedurePorts,
  repositoryProcedure,
} from "./server/repository/adapter/repository-procedure.ts"
import {
  type TokenUsageProcedurePorts,
  tokenUsageProcedure,
} from "./server/token-usage/adapter/token-usage-procedure.ts"
import { type RpcContext, rpcGuard } from "./server/view-server/adapter/rpc-guard.ts"
import { rpcContract } from "./shared/rpc.ts"

/** 全機能の手続きが使う口（機能ごとの口を並べただけ。中身は `src/view-delivery.ts` が渡す）。 */
export type RpcRouterPorts = RepositoryProcedurePorts &
  TokenUsageProcedurePorts &
  ContextUsageProcedurePorts &
  AchievementProcedurePorts

/** 全機能の手続きを束ね、照合のミドルウェアを全部の前に掛ける。 */
export function createRpcRouter(ports: RpcRouterPorts) {
  return implement(rpcContract)
    .$context<RpcContext>()
    .use(rpcGuard)
    .router({
      repository: repositoryProcedure(ports),
      tokenUsage: tokenUsageProcedure(ports),
      contextUsage: contextUsageProcedure(ports),
      achievement: achievementProcedure(ports),
    })
}
