// セッションのコマンドの手続き。形と断る条件は `sessionContract`。
// 照合と断る条件は束ねる側のミドルウェア（`rpcGuard`）が済ませているので、ここは表の行（`sessionCommands`）へ委ね、受け付けなかったことを契約のエラーに訳すだけ。
// セッションの口（`CommandSession`）は手続きの context で受ける。

import { implement, type ORPCErrorConstructorMap } from "@orpc/server"

import type { COMMAND_ERRORS } from "../../../shared/command.ts"
import { sessionContract } from "../../../shared/contract/session.ts"
import type { DispatchResult } from "../../core/command-receiver.ts"
import { type CommandSession, receiveSessionCommand } from "../core/command-session.ts"
import { type SessionCommandPorts, sessionCommands } from "../core/session-command.ts"

export function sessionProcedure(ports: SessionCommandPorts) {
  const table = sessionCommands(ports)
  const procedure = implement(sessionContract).$context<{ readonly session: CommandSession }>()
  return procedure.router({
    prompt: procedure.prompt.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveSessionCommand(table.prompt, input, context.session), errors),
    ),
    interrupt: procedure.interrupt.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveSessionCommand(table.interrupt, input, context.session), errors),
    ),
    answer: procedure.answer.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveSessionCommand(table.answer, input, context.session), errors),
    ),
    setModel: procedure.setModel.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveSessionCommand(table.setModel, input, context.session), errors),
    ),
    setEffort: procedure.setEffort.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveSessionCommand(table.setEffort, input, context.session), errors),
    ),
    setPermissionMode: procedure.setPermissionMode.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveSessionCommand(table.setPermissionMode, input, context.session),
        errors,
      ),
    ),
    nudge: procedure.nudge.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveSessionCommand(table.nudge, input, context.session), errors),
    ),
    switchCharacter: procedure.switchCharacter.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveSessionCommand(table.switchCharacter, input, context.session),
        errors,
      ),
    ),
    setChatMode: procedure.setChatMode.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveSessionCommand(table.setChatMode, input, context.session),
        errors,
      ),
    ),
    switchSession: procedure.switchSession.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveSessionCommand(table.switchSession, input, context.session),
        errors,
      ),
    ),
    startNewSession: procedure.startNewSession.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveSessionCommand(table.startNewSession, input, context.session),
        errors,
      ),
    ),
    reflectAchievement: procedure.reflectAchievement.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveSessionCommand(table.reflectAchievement, input, context.session),
        errors,
      ),
    ),
    setSessionDefault: procedure.setSessionDefault.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveSessionCommand(table.setSessionDefault, input, context.session),
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
