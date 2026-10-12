// 雑談のコマンドの手続き。形と断る条件は `chatContract`。
// 照合と断る条件は束ねる側のミドルウェア（`rpcGuard`）が済ませているので、ここは表の行（`chatCommands`）へ委ね、受け付けなかったことを契約のエラーに訳すだけ。

import { implement } from "@orpc/server"

import { chatContract } from "../../../shared/contract/chat.ts"
import { refusedUnlessAccepted } from "../../adapter/command-refusal.ts"
import { type CommandEventSink, receiveFeatureCommand } from "../../core/command-receiver.ts"
import { type ChatCommandPorts, chatCommands } from "../core/chat-command.ts"

export function chatProcedure(ports: ChatCommandPorts) {
  const table = chatCommands(ports)
  const procedure = implement(chatContract).$context<{ readonly session: CommandEventSink }>()
  return procedure.router({
    forgetRememberedLine: procedure.forgetRememberedLine.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.forgetRememberedLine, input, context.session),
        errors,
      ),
    ),
  })
}
