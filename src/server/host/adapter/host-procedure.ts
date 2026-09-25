// ホストへ頼むコマンドの手続き（`docs/glossary.md`「手続き」）。形は `src/shared/contract/host.ts`、
// 束ねるのは配線の `src/router.ts`。ここは表の行（`host/core/host-command.ts`）へ委ね、
// 受け付けなかったことを契約のエラーに訳すだけ。

import { implement, type ORPCErrorConstructorMap } from "@orpc/server"

import { type COMMAND_ERRORS } from "../../../shared/command.ts"
import { hostContract } from "../../../shared/contract/host.ts"
import {
  type CommandEventSink,
  type DispatchResult,
  receiveFeatureCommand,
} from "../../core/command-receiver.ts"
import { type HostCommandPorts, hostCommands } from "../core/host-command.ts"

export function hostProcedure(ports: HostCommandPorts) {
  const table = hostCommands(ports)
  const procedure = implement(hostContract).$context<{ readonly session: CommandEventSink }>()
  return procedure.router({
    openFile: procedure.openFile.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.openFile, input, context.session), errors),
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
