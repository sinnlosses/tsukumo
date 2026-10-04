// キャラクターを消す／同梱に戻す帯の中身。

import type {
  CharacterInfo,
  CharacterPackRemoval,
} from "../../../../../../shared/character-pack/character.ts"
import type { SessionDispatch } from "../../../../../stores/session.ts"
import { DELETE_COPY } from "../../domain/character-edit-copy.ts"
import type { CharacterDeleteBandModel } from "../../domain/character-edit-model.ts"

/**
 * 帯とダイアログの文言・押せるか・送り先を畳む（`removal` が `"none"` でないときだけ呼ぶ）。
 * 打った id が一致するかどうかの判定は `CharacterDeleteConfirm` が持つ。
 */
export function deleteBandOf(
  removal: Exclude<CharacterPackRemoval, "none">,
  character: CharacterInfo,
  inUse: boolean,
  dispatch: SessionDispatch,
): CharacterDeleteBandModel {
  const copy = DELETE_COPY[removal]
  const name = character.name ?? character.pack
  return {
    kind: "shown",
    pack: character.pack,
    heading: copy.heading,
    note: copy.note,
    buttonLabel: `${name} を${copy.verb}`,
    dialogHeading: `${name} を${copy.dialogQuestion}`,
    dialogNote: copy.dialogNote(character.expressionsWithPortrait.length),
    okLabel: copy.verb,
    face:
      character.face === undefined ? { kind: "absent" } : { kind: "shown", url: character.face },
    disabled: inUse,
    title: inUse ? copy.blockedTitle : undefined,
    onSubmit: () => {
      dispatch.characterPack.delete({ pack: character.pack })
    },
  }
}
