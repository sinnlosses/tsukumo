// 訪問のコマンドの手続き（`docs/glossary.md`「手続き」）。形は `src/shared/contract/visit.ts`、
// 束ねるのは配線の `src/router.ts`。ここは表の行（`visit/core/visit-command.ts`）へ委ね、
// 受け付けなかったことを契約のエラーに訳すだけ。

import { implement, type ORPCErrorConstructorMap } from "@orpc/server"

import { type COMMAND_ERRORS } from "../../../shared/command.ts"
import { visitContract } from "../../../shared/contract/visit.ts"
import {
  type CommandEventSink,
  type DispatchResult,
  receiveFeatureCommand,
} from "../../core/command-receiver.ts"
import { type VisitCommandPorts, visitCommands } from "../core/visit-command.ts"

export function visitProcedure(ports: VisitCommandPorts) {
  const table = visitCommands(ports)
  const procedure = implement(visitContract).$context<{ readonly session: CommandEventSink }>()
  return procedure.router({
    setEnabled: procedure.setEnabled.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.setEnabled, input, context.session),
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
