// 全機能の手続きを束ねる。
// 持つのは「どの手続きをどの機能が受けるか」の対応と、全部の前に掛けるミドルウェアだけ。
// 手続きの中身も、照合・断る条件の判定も書かない。
// 束は載せる先ごとに2つで、読み取り（HTTP の `/rpc`）と、コマンドに押し出しの購読を足したもの（`/ws`）。
// 形（名前と入出力と断る条件）は `rpcContract` / `commandContract` / `socketContract` が持ち、ここはそれに受け手を付ける。

import { implement } from "@orpc/server"

import {
  type AchievementProcedurePorts,
  achievementProcedure,
} from "./server/achievement/adapter/achievement-procedure.ts"
import { characterPackProcedure } from "./server/character-pack/adapter/character-pack-procedure.ts"
import type { CharacterPackCommandPorts } from "./server/character-pack/core/character-pack-command.ts"
import { chatProcedure } from "./server/chat/adapter/chat-procedure.ts"
import type { ChatCommandPorts } from "./server/chat/core/chat-command.ts"
import {
  type DiagnosticProcedurePorts,
  diagnosticProcedure,
} from "./server/diagnostic/adapter/diagnostic-procedure.ts"
import { hostProcedure } from "./server/host/adapter/host-procedure.ts"
import type { HostCommandPorts } from "./server/host/core/host-command.ts"
import { itemProcedure } from "./server/item/adapter/item-procedure.ts"
import type { ItemCommandPorts } from "./server/item/core/item-command.ts"
import {
  type RepositoryProcedurePorts,
  repositoryProcedure,
} from "./server/repository/adapter/repository-procedure.ts"
import {
  type SessionClaimProcedurePorts,
  sessionClaimProcedure,
} from "./server/session/adapter/session-claim-procedure.ts"
import {
  type SessionDigestProcedurePorts,
  sessionDigestProcedure,
} from "./server/session/adapter/session-digest-procedure.ts"
import { sessionProcedure } from "./server/session/adapter/session-procedure.ts"
import type { SessionCommandPorts } from "./server/session/core/session-command.ts"
import {
  type ContextUsageProcedurePorts,
  contextUsageProcedure,
} from "./server/usage/adapter/context-usage-procedure.ts"
import {
  type ExperienceMetricProcedurePorts,
  experienceMetricProcedure,
} from "./server/usage/adapter/experience-metric-procedure.ts"
import {
  type PlanUsageProcedurePorts,
  planUsageProcedure,
} from "./server/usage/adapter/plan-usage-procedure.ts"
import {
  type TokenUsageProcedurePorts,
  tokenUsageProcedure,
} from "./server/usage/adapter/token-usage-procedure.ts"
import { usageReviewProcedure } from "./server/usage/adapter/usage-review-procedure.ts"
import type { UsageReviewCommandPorts } from "./server/usage/core/usage-review-command.ts"
import { frameProcedure } from "./server/view-server/adapter/frame-procedure.ts"
import {
  commandGuard,
  type CommandRpcContext,
  type RpcContext,
  rpcGuard,
  type SocketRpcContext,
} from "./server/view-server/adapter/rpc-guard.ts"
import {
  workflowSettingCommandProcedure,
  type WorkflowSettingProcedurePorts,
  workflowSettingProcedure,
} from "./server/workflow-setting/adapter/workflow-setting-procedure.ts"
import { frameContract } from "./shared/contract/frame.ts"
import { commandContract, rpcContract } from "./shared/rpc.ts"

export type RpcRouterPorts = RepositoryProcedurePorts &
  TokenUsageProcedurePorts &
  ContextUsageProcedurePorts &
  PlanUsageProcedurePorts &
  AchievementProcedurePorts &
  SessionDigestProcedurePorts &
  SessionClaimProcedurePorts &
  Pick<WorkflowSettingProcedurePorts, "readWorkflowSetting" | "readWorkflowEntries">

/** 読み取りの手続きを束ね、照合のミドルウェアを全部の前に掛ける（`/rpc` に載る）。 */
export function createRpcRouter(ports: RpcRouterPorts) {
  return implement(rpcContract)
    .$context<RpcContext>()
    .use(rpcGuard)
    .router({
      repository: repositoryProcedure(ports),
      tokenUsage: tokenUsageProcedure(ports),
      contextUsage: contextUsageProcedure(ports),
      planUsage: planUsageProcedure(ports),
      achievement: achievementProcedure(ports),
      sessionDigest: sessionDigestProcedure(ports),
      sessionClaim: sessionClaimProcedure(ports),
      workflowSetting: workflowSettingProcedure(ports),
    })
}

export type CommandRouterPorts = {
  readonly session: SessionCommandPorts
  readonly characterPack: CharacterPackCommandPorts
  readonly item: ItemCommandPorts
  readonly chat: ChatCommandPorts
  readonly usageReview: UsageReviewCommandPorts
  readonly host: HostCommandPorts
  readonly workflowSetting: Pick<WorkflowSettingProcedurePorts, "changeWorkflowSetting">
  readonly diagnostic: DiagnosticProcedurePorts
  readonly experienceMetric: ExperienceMetricProcedurePorts
}

/**
 * `/ws` に載せるルータ。
 * コマンドの手続きに、押し出しの購読（`frame.subscribe`）を足したもの。
 * 購読はコマンドではないので、照合だけを掛けて断る条件（{@link commandGuard}）は見ない。
 */
export function createSocketRouter(ports: CommandRouterPorts) {
  return {
    ...createCommandRouter(ports),
    frame: implement(frameContract)
      .$context<SocketRpcContext>()
      .use(rpcGuard)
      .router(frameProcedure()),
  }
}

/** コマンドの手続きを束ね、照合と断る条件のミドルウェアを全部の前に掛ける。 */
function createCommandRouter(ports: CommandRouterPorts) {
  return implement(commandContract)
    .$context<CommandRpcContext>()
    .use(rpcGuard)
    .use(commandGuard)
    .router({
      session: sessionProcedure(ports.session),
      characterPack: characterPackProcedure(ports.characterPack),
      item: itemProcedure(ports.item),
      chat: chatProcedure(ports.chat),
      usageReview: usageReviewProcedure(ports.usageReview),
      host: hostProcedure(ports.host),
      workflowSetting: workflowSettingCommandProcedure(ports.workflowSetting),
      diagnostic: diagnosticProcedure(ports.diagnostic),
      experienceMetric: experienceMetricProcedure(ports.experienceMetric),
    })
}
