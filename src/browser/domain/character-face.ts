// いまのパックの顔（`CharacterInfo.face`）を `<CharacterFace>`（`components/domain/character-face.tsx`）
// が受け取れる形へ畳む。画面のナビの帯とトークン消費の画面の両方が読むので
// `browser/domain/`（CLAUDE.md 原則5）。

import { type CharacterInfo } from "../../shared/character.ts"

/** `<CharacterFace>` が受け取れる形。`url` が無ければ何も描かない。 */
export type CharacterFaceInfo = {
  readonly url: string | undefined
  readonly alt: string
}

/** `character` が無ければ `url` も `alt` も「無い」。 */
export function characterFaceInfo(character: CharacterInfo | undefined): CharacterFaceInfo {
  return { url: character?.face, alt: character?.name ?? "" }
}
