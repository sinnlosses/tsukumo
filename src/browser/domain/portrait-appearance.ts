// キャラクター・表情・衣装から、立ち絵の見た目（URL・差し色・代替テキスト）を導く。
// 置き場の基準は `docs/design.md` 2章「`lib/` と `utils/` に置く基準」— 名乗るのが tsukumo の
// 語彙（立ち絵・キャラクター・表情・衣装）で、読み手が2つ以上の機能（`character-view` /
// `chat-view`）なので `browser/domain/`。
import { type CharacterInfo } from "../../shared/character.ts"
import { resolveExpressionLabel } from "../../shared/expression-choice.ts"
import { type Expression, type Outfit } from "../../shared/expression.ts"

/** character.json に `name` が無い・定義自体が無いときの、キャラクターの既定の呼び名。 */
export const DEFAULT_CHARACTER_NAME = "キャラクター"

/** キャラクター・表情・衣装から導く、立ち絵の見た目。 */
export type PortraitAppearance = {
  /** 立ち絵の素材 URL。character が届いていなければ undefined（吹き出しだけで成立させる）。 */
  readonly portraitUrl: string | undefined
  readonly accent: string | undefined
  readonly altText: string
}

/**
 * 表情・衣装から立ち絵の見た目を組み立てる。**表情のラベルはキャラクターパックの定義から
 * 来る**（docs/design.md 7章）。定義が届く前・ラベルが無い表情では、表情名そのものが
 * ラベルになる。
 */
export function portraitAppearance(
  character: CharacterInfo | undefined,
  expression: Expression,
  outfit: Outfit,
): PortraitAppearance {
  return {
    portraitUrl: character?.portraits?.[expression],
    accent: character?.outfitAccents[outfit],
    altText: `${character?.name ?? DEFAULT_CHARACTER_NAME}（${resolveExpressionLabel(
      character?.expressions ?? [],
      expression,
    )}）`,
  }
}
