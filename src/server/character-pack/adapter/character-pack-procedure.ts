// キャラクターパックのコマンドの手続き（`docs/glossary.md`「手続き」）。形は
// `src/shared/contract/character-pack.ts`、束ねるのは配線の `src/router.ts`。ここは表の行
// （`character-pack/core/character-pack-command.ts`）へ委ね、受け付けなかったことを契約のエラーに
// 訳すだけ。

import { implement, type ORPCErrorConstructorMap } from "@orpc/server"

import { type COMMAND_ERRORS } from "../../../shared/command.ts"
import { characterPackContract } from "../../../shared/contract/character-pack.ts"
import {
  type CommandEventSink,
  type DispatchResult,
  receiveFeatureCommand,
} from "../../core/command-receiver.ts"
import {
  type CharacterPackCommandPorts,
  characterPackCommands,
} from "../core/character-pack-command.ts"

export function characterPackProcedure(ports: CharacterPackCommandPorts) {
  const table = characterPackCommands(ports)
  const procedure = implement(characterPackContract).$context<{
    readonly session: CommandEventSink
  }>()
  return procedure.router({
    setPortrait: procedure.setPortrait.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.setPortrait, input, context.session),
        errors,
      ),
    ),
    clearPortrait: procedure.clearPortrait.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.clearPortrait, input, context.session),
        errors,
      ),
    ),
    setOutfitAccent: procedure.setOutfitAccent.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.setOutfitAccent, input, context.session),
        errors,
      ),
    ),
    setAccent: procedure.setAccent.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.setAccent, input, context.session), errors),
    ),
    clearChatAccent: procedure.clearChatAccent.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.clearChatAccent, input, context.session),
        errors,
      ),
    ),
    setProfile: procedure.setProfile.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.setProfile, input, context.session),
        errors,
      ),
    ),
    setBackground: procedure.setBackground.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.setBackground, input, context.session),
        errors,
      ),
    ),
    clearBackground: procedure.clearBackground.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.clearBackground, input, context.session),
        errors,
      ),
    ),
    setFace: procedure.setFace.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.setFace, input, context.session), errors),
    ),
    clearFace: procedure.clearFace.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.clearFace, input, context.session), errors),
    ),
    create: procedure.create.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.create, input, context.session), errors),
    ),
    delete: procedure.delete.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.delete, input, context.session), errors),
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
