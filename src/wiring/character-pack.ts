// キャラクターパックの配線。画面からパックを作る・直す・消すコマンドの中身を選ぶ。

import type { CurrentCharacter } from "../current-character.ts"
import type { CharacterPackCommandPorts } from "../server/character-pack/core/character-pack-command.ts"

export function wireCharacterPack(character: CurrentCharacter): {
  readonly commands: CharacterPackCommandPorts
} {
  return {
    commands: {
      editCharacter: (edit) => Promise.resolve(character.applyEdit(edit)),
      createCharacter: (create) => Promise.resolve(character.applyCreate(create)),
      deleteCharacter: (remove) => Promise.resolve(character.applyDelete(remove)),
    },
  }
}
