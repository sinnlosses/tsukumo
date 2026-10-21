// アイテムのコマンドの手続き。形は `itemContract`。
// 表の行（`itemCommands`）へ委ね、受け付けなかったことを契約のエラーに訳すだけ。

import { implement } from "@orpc/server"

import { itemContract } from "../../../shared/contract/item.ts"
import { refusedUnlessAccepted } from "../../adapter/command-refusal.ts"
import { type CommandEventSink, receiveFeatureCommand } from "../../core/command-receiver.ts"
import { type ItemCommandPorts, itemCommands } from "../core/item-command.ts"

export function itemProcedure(ports: ItemCommandPorts) {
  const table = itemCommands(ports)
  const procedure = implement(itemContract).$context<{
    readonly session: CommandEventSink
  }>()
  return procedure.router({
    add: procedure.add.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.add, input, context.session), errors),
    ),
    remove: procedure.remove.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.remove, input, context.session), errors),
    ),
    setSeat: procedure.setSeat.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.setSeat, input, context.session), errors),
    ),
    clearSeat: procedure.clearSeat.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.clearSeat, input, context.session), errors),
    ),
  })
}
