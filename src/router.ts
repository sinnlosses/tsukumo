// 全機能の手続きを束ねる（配線。`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
// **「どの手続きをどの機能が受けるか」の答えはこのファイル**で、手続きの中身も照合・断る条件の
// 判定も書かない（名前と手続きの対応と、全部の前に掛けるミドルウェアだけ）。束は載せる先ごとに
// 2つ——読み取り（HTTP の `/rpc`）とコマンド（`/ws`）。
//
// 束ねるのを配線に置くのは、機能どうしの辺の表を増やさないため（`session` の受け手の表が
// `usage-review` や `host` を読むと、`session` がまた全部を知る場所に戻る。葉の機能の手続きが
// 読むのは `shared` と共有の `core` と自分の機能だけ）。形（名前と入出力と断る条件）は
// `src/shared/rpc.ts` の `rpcContract` / `commandContract` が正典で、ここはそれに受け手を付ける。

import { implement } from "@orpc/server"

import {
  type AchievementProcedurePorts,
  achievementProcedure,
} from "./server/achievement/adapter/achievement-procedure.ts"
import { characterPackProcedure } from "./server/character-pack/adapter/character-pack-procedure.ts"
import { type CharacterPackCommandPorts } from "./server/character-pack/core/character-pack-command.ts"
import { chatProcedure } from "./server/chat/adapter/chat-procedure.ts"
import { type ChatCommandPorts } from "./server/chat/core/chat-command.ts"
import {
  type ContextUsageProcedurePorts,
  contextUsageProcedure,
} from "./server/context-usage/adapter/context-usage-procedure.ts"
import { hostProcedure } from "./server/host/adapter/host-procedure.ts"
import { type HostCommandPorts } from "./server/host/core/host-command.ts"
import {
  type RepositoryProcedurePorts,
  repositoryProcedure,
} from "./server/repository/adapter/repository-procedure.ts"
import { sessionProcedure } from "./server/session/adapter/session-procedure.ts"
import { type SessionCommandPorts } from "./server/session/core/session-command.ts"
import {
  type TokenUsageProcedurePorts,
  tokenUsageProcedure,
} from "./server/token-usage/adapter/token-usage-procedure.ts"
import { usageReviewProcedure } from "./server/usage-review/adapter/usage-review-procedure.ts"
import { type UsageReviewCommandPorts } from "./server/usage-review/core/usage-review-command.ts"
import {
  commandGuard,
  type CommandRpcContext,
  type RpcContext,
  rpcGuard,
} from "./server/view-server/adapter/rpc-guard.ts"
import { visitProcedure } from "./server/visit/adapter/visit-procedure.ts"
import { type VisitCommandPorts } from "./server/visit/core/visit-command.ts"
import { commandContract, rpcContract } from "./shared/rpc.ts"

/** 読み取りの手続きが使う口（機能ごとの口を並べただけ。中身は `src/view-delivery.ts` が渡す）。 */
export type RpcRouterPorts = RepositoryProcedurePorts &
  TokenUsageProcedurePorts &
  ContextUsageProcedurePorts &
  AchievementProcedurePorts

/** 読み取りの手続きを束ね、照合のミドルウェアを全部の前に掛ける（`/rpc` に載る）。 */
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

/** コマンドの手続きが使う機能ごとの書き込み口（中身は `src/session-start.ts` が選んで渡す）。 */
export type CommandRouterPorts = {
  readonly session: SessionCommandPorts
  readonly characterPack: CharacterPackCommandPorts
  readonly chat: ChatCommandPorts
  readonly visit: VisitCommandPorts
  readonly usageReview: UsageReviewCommandPorts
  readonly host: HostCommandPorts
}

/**
 * コマンドの手続きを束ね、照合と断る条件のミドルウェアを全部の前に掛ける（`/ws` に載る）。
 * 28種の網羅は契約（`commandContract`）が型で見る。
 */
export function createCommandRouter(ports: CommandRouterPorts) {
  return implement(commandContract)
    .$context<CommandRpcContext>()
    .use(rpcGuard)
    .use(commandGuard)
    .router({
      session: sessionProcedure(ports.session),
      characterPack: characterPackProcedure(ports.characterPack),
      chat: chatProcedure(ports.chat),
      visit: visitProcedure(ports.visit),
      usageReview: usageReviewProcedure(ports.usageReview),
      host: hostProcedure(ports.host),
    })
}
