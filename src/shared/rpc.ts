// 手続きの口の経路名と、全機能の契約を束ねたもの。束は載せる先ごとに2つ——読み取り
// （`rpcContract`。HTTP の `/rpc`）と、コマンドに押し出しの購読を足したもの（`socketContract`。
// WebSocket の `/ws`）。サーバ
// （`src/router.ts` が受け手を付け、`server.ts` / `session-socket.ts` が載せる）とブラウザ
// （`src/browser/lib/rpc-client.ts` と `src/browser/stores/session.tsx` が型付きの client を作る）の
// 両方が同じ値を見るので shared に置く。
//
// 機能ごとの契約は `src/shared/contract/<機能>.ts`（`docs/design.md` 2章「コマンドの受け手と
// 手続きの置き方」）。ここは名前と契約の対応だけを持ち、形は書かない。束ねた名前がそのまま
// 手続きの経路になる（`/rpc/<機能>/<手続き>`。コマンドは `/ws` の上の同じ名前）。
//
// コマンドを `/rpc` に載せないのは、依頼に添えた画像（原寸2枚で約 14 MiB）を運ぶ口が `/ws` の
// 上限（`session-socket.ts` の `MAX_MESSAGE_BYTES`）だけだから（`/rpc` の本文は 64 KiB で断る）。
//
// 起動トークンが要る（`/ws` と同じく `?t=<起動トークン>` を付ける。照合は
// `src/server/view-server/adapter/rpc-guard.ts`）。配るのは利用者の作業ディレクトリの中身・
// 使った量・いまのセッションが積んでいるものの内訳・タスクの要約で、誰にでも配ってよい静的な物
// ではない。

import { type ContractRouterClient } from "@orpc/contract"

import { achievementContract } from "./contract/achievement.ts"
import { characterPackContract } from "./contract/character-pack.ts"
import { chatContract } from "./contract/chat.ts"
import { contextUsageContract } from "./contract/context-usage.ts"
import { frameContract } from "./contract/frame.ts"
import { hostContract } from "./contract/host.ts"
import { repositoryContract } from "./contract/repository.ts"
import { sessionContract } from "./contract/session.ts"
import { tokenUsageContract } from "./contract/token-usage.ts"
import { usageReviewContract } from "./contract/usage-review.ts"
import { visitContract } from "./contract/visit.ts"

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

/**
 * コマンド（画面からの書き込み）の契約。`/ws` の上で呼ぶ（`session-socket.ts`）。断る条件は
 * 各契約の `meta`（`src/shared/command.ts` の `CommandMeta`）。
 */
export const commandContract = {
  session: sessionContract,
  characterPack: characterPackContract,
  chat: chatContract,
  visit: visitContract,
  usageReview: usageReviewContract,
  host: hostContract,
}

/** ブラウザがコマンドを送る client の型（契約から導く）。 */
export type CommandClient = ContractRouterClient<typeof commandContract>

/**
 * `/ws` に載せる束。コマンドに、押し出しの購読（`frame.subscribe`。コマンドではないので
 * {@link commandContract} には入れない）を足したもの。
 */
export const socketContract = {
  ...commandContract,
  frame: frameContract,
}
