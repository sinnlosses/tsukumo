// ホストへ頼むコマンドの手続き。形は `hostContract`。
// ここは表の行（`hostCommands`）へ委ね、受け付けなかったことを契約のエラーに訳すだけ。

import { implement } from "@orpc/server"

import { hostContract } from "../../../shared/contract/host.ts"
import { refusedUnlessAccepted } from "../../adapter/command-refusal.ts"
import { type CommandEventSink, receiveFeatureCommand } from "../../core/command-receiver.ts"
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
