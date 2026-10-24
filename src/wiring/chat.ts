// 雑談の配線。ターンの終わりの定着と、「覚えていること」から1行消すコマンドの中身を選ぶ。

import type { CurrentCharacter } from "../current-character.ts"
import { createQueryLock } from "../server/adapter/query-lock.ts"
import { queryStructured } from "../server/adapter/sdk-structured-query.ts"
import { chatConsolidationLockPath } from "../server/chat/adapter/chat-archive.ts"
import { createChatSummary } from "../server/chat/adapter/chat-summary.ts"
import type { ChatCommandPorts } from "../server/chat/core/chat-command.ts"
import {
  type ChatConsolidationSource,
  createChatConsolidationWriter,
} from "../server/chat/core/chat-consolidation-writer.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager-port.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireChat(
  context: WiringContext,
  character: CurrentCharacter,
): {
  readonly manager: Pick<SessionManagerOptions, "chatConsolidation">
  readonly commands: ChatCommandPorts
} {
  return {
    manager: {
      // 疑似セッションでは claude を起こさないので、定着は走らせない。
      chatConsolidation: chatConsolidationOf(context),
    },
    commands: {
      forgetRememberedLine: (line) => Promise.resolve(character.forgetRememberedLine(line)),
    },
  }
}

function chatConsolidationOf(context: WiringContext): ChatConsolidationSource {
  const { driver } = context
  switch (driver.kind) {
    case "sdk":
      return chatConsolidationSource(context)
    case "fake":
      return { kind: "dont-consolidate" }
    default:
      return driver satisfies never
  }
}

/**
 * 定着の出どころ。
 * 書く先は会話のアーカイブと同じ口と、パックごとのあらすじのファイル。
 * `query()` は雑談のセッションと同じ作業先・引き継いだ環境で起こす。
 */
function chatConsolidationSource(context: WiringContext): ChatConsolidationSource {
  const { chatArchive, cwd, inheritedEnv, now, throwawayQuery } = context
  return {
    kind: "consolidate",
    consolidate: createChatConsolidationWriter({
      archive: chatArchive,
      lockConsolidation: createQueryLock(chatConsolidationLockPath),
      chatSummary: (packName) => createChatSummary(packName),
      query: (request, signal) =>
        queryStructured(request, { cwd, env: inheritedEnv, record: throwawayQuery, now }, signal),
      now,
    }),
  }
}
