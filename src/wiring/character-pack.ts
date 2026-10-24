// キャラクターパックの配線。画面からパックを作る・直す・消すコマンドと、作る前に欄を埋める生成の中身を選ぶ。

import type { CurrentCharacter } from "../current-character.ts"
import { queryCharacterGeneration } from "../server/character-pack/adapter/sdk-character-generation.ts"
import {
  CHARACTER_GENERATION_TIMEOUT_MS,
  generateCharacter,
} from "../server/character-pack/core/character-generation.ts"
import type { CharacterPackCommandPorts } from "../server/character-pack/core/character-pack-command.ts"
import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import { failureDiagnostic } from "./failure-diagnostic.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireCharacterPack(
  context: WiringContext,
  character: CurrentCharacter,
  diagnosticLog: DiagnosticLog,
): {
  readonly commands: CharacterPackCommandPorts
} {
  const { cwd, inheritedEnv } = context
  const reportFailure = failureDiagnostic(diagnosticLog, context.now)
  return {
    commands: {
      editCharacter: (edit) => Promise.resolve(character.applyEdit(edit)),
      createCharacter: (create) => Promise.resolve(character.applyCreate(create)),
      deleteCharacter: (remove) => Promise.resolve(character.applyDelete(remove)),
      generateFromPortrait: async (portrait) => {
        if (context.driver.kind === "fake") {
          return undefined
        }
        const generated = await generateCharacter(
          (request, signal) =>
            queryCharacterGeneration(request, { cwd, env: inheritedEnv }, signal),
          portrait,
          AbortSignal.timeout(CHARACTER_GENERATION_TIMEOUT_MS),
        )
        if (generated === undefined) {
          reportFailure(
            { feature: "character-pack", place: "generation-failed" },
            new Error("立ち絵から生成できなかった"),
          )
        }
        return generated
      },
    },
  }
}
