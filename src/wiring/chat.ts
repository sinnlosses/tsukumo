// 雑談の配線。ターンの終わりの定着と、「覚えていること」から1行消すコマンドの中身を選ぶ。

import type { CurrentCharacter } from "../current-character.ts"
import { createChatConsolidationLock } from "../server/chat/adapter/chat-consolidation-lock.ts"
import { createChatSummary } from "../server/chat/adapter/chat-summary.ts"
import { queryChatConsolidation } from "../server/chat/adapter/sdk-chat-consolidation.ts"
import type { ChatCommandPorts } from "../server/chat/core/chat-command.ts"
import {
  type ChatConsolidationSource,
  createChatConsolidationWriter,
} from "../server/chat/core/chat-consolidation-writer.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager.ts"
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
      chatConsolidation:
        context.fakeSession === undefined
          ? chatConsolidationSource(context)
          : { kind: "dont-consolidate" },
    },
    commands: {
      forgetRememberedLine: (line) => Promise.resolve(character.forgetRememberedLine(line)),
    },
  }
}

/**
 * 定着の出どころ。
 * 書く先は会話のアーカイブと同じ口と、パックごとのあらすじのファイル。
 * `query()` は雑談のセッションと同じ作業先・引き継いだ環境で起こす。
 */
function chatConsolidationSource(context: WiringContext): ChatConsolidationSource {
  const { chatArchive, cwd, inheritedEnv, now } = context
  return {
    kind: "consolidate",
    consolidate: createChatConsolidationWriter({
      archive: chatArchive,
      lockConsolidation: createChatConsolidationLock(),
      chatSummary: (packName) => createChatSummary(packName),
      query: (request, signal) =>
        queryChatConsolidation(request, { cwd, env: inheritedEnv }, signal),
      now,
    }),
  }
}
