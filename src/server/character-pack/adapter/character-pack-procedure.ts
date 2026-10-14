// キャラクターパックのコマンドの手続き。形は `characterPackContract`。
// ここは表の行（`characterPackCommands`）へ委ね、受け付けなかったことを契約のエラーに訳すだけ。
// 値を返す `generateFromPortrait` だけは表を通らず、口の戻り値をそのまま応答にする。

import { implement } from "@orpc/server"

import { characterPackContract } from "../../../shared/contract/character-pack.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { refusedUnlessAccepted } from "../../adapter/command-refusal.ts"
import { type CommandEventSink, receiveFeatureCommand } from "../../core/command-receiver.ts"
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
    setPersona: procedure.setPersona.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(
        receiveFeatureCommand(table.setPersona, input, context.session),
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
    setMini: procedure.setMini.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.setMini, input, context.session), errors),
    ),
    clearMini: procedure.clearMini.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.clearMini, input, context.session), errors),
    ),
    create: procedure.create.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.create, input, context.session), errors),
    ),
    delete: procedure.delete.handler(({ input, context, errors }) =>
      refusedUnlessAccepted(receiveFeatureCommand(table.delete, input, context.session), errors),
    ),
    generateFromPortrait: procedure.generateFromPortrait.handler(async ({ input, errors }) => {
      const generated = await ports.generateFromPortrait(input.portrait).catch(() => undefined)
      if (generated === undefined) {
        throw errors.REFUSED({
          data: { reason: FRAME_ERROR_REASON.characterGenerationFailed },
        })
      }
      return generated
    }),
  })
}
