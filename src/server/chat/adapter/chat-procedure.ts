// 雑談のコマンドの手続き（`docs/glossary.md`「手続き」）。形と断る条件は
// `src/shared/contract/chat.ts`、束ねるのは配線の `src/router.ts`。照合と断る条件は束ねる側の
// ミドルウェア（`rpc-guard.ts`）が済ませているので、ここは表の行
// （`chat/core/chat-command.ts`）へ委ね、受け付けなかったことを契約のエラーに訳すだけ。

import { implement, type ORPCErrorConstructorMap } from "@orpc/server"

import { type COMMAND_ERRORS } from "../../../shared/command.ts"
import { chatContract } from "../../../shared/contract/chat.ts"
import {
  type CommandEventSink,
  type DispatchResult,
  receiveFeatureCommand,
} from "../../core/command-receiver.ts"
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

/** 受け付けなかったことを契約のエラー（`REFUSED`。理由は定型文だけ）に訳す。 */
async function refusedUnlessAccepted(
  pending: Promise<DispatchResult>,
  errors: ORPCErrorConstructorMap<typeof COMMAND_ERRORS>,
): Promise<void> {
  const result = await pending
  if (!result.ok) {
    throw errors.REFUSED({ data: { reason: result.reason } })
  }
}
