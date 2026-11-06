// いまのパックの顔（`CharacterInfo.face`）を `<CharacterFace>` が受け取れる形へ畳む。

import type { CharacterInfo } from "../../shared/character-pack/character.ts"

export type CharacterFaceInfo = {
  readonly url?: string
  readonly alt: string
}

/** `character` が無ければ `url` も `alt` も「無い」。 */
export function characterFaceInfo(character?: CharacterInfo): CharacterFaceInfo {
  return { url: character?.face, alt: character?.name ?? "" }
}
