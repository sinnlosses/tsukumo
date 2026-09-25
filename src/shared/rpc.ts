// 手続きの口（`/rpc`）の経路名と、全機能の契約を1つに束ねたもの。**サーバ（`src/router.ts` が
// 受け手を付け、`src/server/view-server/adapter/server.ts` が `/rpc` に載せる）とブラウザ
// （`src/browser/lib/rpc-client.ts` が型付きの client を作る）の両方が同じ値を見る**ので shared に置く。
//
// 機能ごとの契約は `src/shared/contract/<機能>.ts`（`docs/design.md` 2章「コマンドの受け手と
// 手続きの置き方」）。ここは名前と契約の対応だけを持ち、形は書かない。**束ねた名前がそのまま
// 手続きの経路になる**（`/rpc/<機能>/<手続き>`）。
//
// **起動トークンが要る**（`/ws` と同じく `?t=<起動トークン>` を付ける。照合は
// `src/server/view-server/adapter/rpc-guard.ts`）。配るのは利用者の作業ディレクトリの中身・
// 使った量・いまのセッションが積んでいるものの内訳・タスクの要約で、誰にでも配ってよい静的な物
// ではない。

import { type ContractRouterClient } from "@orpc/contract"

import { achievementContract } from "./contract/achievement.ts"
import { contextUsageContract } from "./contract/context-usage.ts"
import { repositoryContract } from "./contract/repository.ts"
import { tokenUsageContract } from "./contract/token-usage.ts"

/** 手続きの口の経路（`POST /rpc/<機能>/<手続き>?t=<起動トークン>`）。 */
export const RPC_PATH = "/rpc"

export const rpcContract = {
  repository: repositoryContract,
  tokenUsage: tokenUsageContract,
  contextUsage: contextUsageContract,
  achievement: achievementContract,
}

/** ブラウザが手続きを呼ぶ client の型（契約から導く）。 */
export type RpcClient = ContractRouterClient<typeof rpcContract>
