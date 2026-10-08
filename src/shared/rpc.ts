// 手続きの口の経路名と、全機能の契約を束ねたもの。
// 束は載せる先ごとに2つで、読み取り（`rpcContract`。HTTP の `/rpc`）と、コマンドに押し出しの購読を足したもの（`socketContract`。WebSocket の `/ws`）。
// ここは名前と契約の対応だけを持ち、形は書かない。
// 束ねた名前がそのまま手続きの経路になる（`/rpc/<機能>/<手続き>`。コマンドは `/ws` の上の同じ名前）。
//
// コマンドを `/rpc` に載せないのは、依頼に添えた画像（原寸2枚で約 14 MiB）を運べるのが `/ws` の上限（`MAX_MESSAGE_BYTES`）だけだから（`/rpc` の本文は 64 KiB で断る）。
//
// 起動トークンが要る（`/ws` と同じく `?t=<起動トークン>` を付ける）。
// 配るのは利用者の作業ディレクトリの中身・使った量・セッションの内訳や要約で、誰にでも配ってよい静的な物ではない。

import type { ContractRouterClient } from "@orpc/contract"

import { achievementContract } from "./contract/achievement.ts"
import { characterPackContract } from "./contract/character-pack.ts"
import { chatContract } from "./contract/chat.ts"
import { contextUsageContract } from "./contract/context-usage.ts"
import { diagnosticContract } from "./contract/diagnostic.ts"
import { frameContract } from "./contract/frame.ts"
import { hostContract } from "./contract/host.ts"
import { planUsageContract } from "./contract/plan-usage.ts"
import { repositoryContract } from "./contract/repository.ts"
import { sessionDigestContract } from "./contract/session-digest.ts"
import { sessionContract } from "./contract/session.ts"
import { tokenUsageContract } from "./contract/token-usage.ts"
import { usageReviewContract } from "./contract/usage-review.ts"

/** 手続きの口の経路（`POST /rpc/<機能>/<手続き>?t=<起動トークン>`）。 */
export const RPC_PATH = "/rpc"

export const rpcContract = {
  repository: repositoryContract,
  tokenUsage: tokenUsageContract,
  contextUsage: contextUsageContract,
  planUsage: planUsageContract,
  achievement: achievementContract,
  sessionDigest: sessionDigestContract,
  diagnostic: diagnosticContract,
}

/** ブラウザが手続きを呼ぶ client の型（契約から導く）。 */
export type RpcClient = ContractRouterClient<typeof rpcContract>

/** コマンド（画面からの書き込み）の契約。`/ws` の上で呼ぶ。断る条件は各契約の `meta`（`CommandMeta`）。 */
export const commandContract = {
  session: sessionContract,
  characterPack: characterPackContract,
  chat: chatContract,
  usageReview: usageReviewContract,
  host: hostContract,
}

/** ブラウザがコマンドを送る client の型（契約から導く）。 */
export type CommandClient = ContractRouterClient<typeof commandContract>

/**
 * `/ws` に載せる束。
 * コマンドに、押し出しの購読（`frame.subscribe`）を足したもの。購読はコマンドではないので {@link commandContract} には入れない。
 */
export const socketContract = {
  ...commandContract,
  frame: frameContract,
}
