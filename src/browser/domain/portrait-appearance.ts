// キャラクター・表情から、立ち絵の見た目（URL・代替テキスト）を導く。
import type { CharacterInfo } from "../../shared/character-pack/character.ts"
import { resolveExpressionLabel } from "../../shared/character-pack/expression-choice.ts"
import type { Expression } from "../../shared/character-pack/expression.ts"

/** character.json に `name` が無い・定義自体が無いときの、キャラクターの既定の呼び名。 */
export const DEFAULT_CHARACTER_NAME = "キャラクター"

export type PortraitAppearance = {
  /** 立ち絵の素材 URL。character が届いていなければ undefined（吹き出しだけで成立させる）。 */
  readonly portraitUrl: string | undefined
  readonly altText: string
}

/**
 * 表情から立ち絵の見た目を組み立てる。表情のラベルはキャラクターパックの定義から来る。
 * 定義が届く前・ラベルが無い表情では、表情名そのものがラベルになる。
 */
export function portraitAppearance(
  character: CharacterInfo | undefined,
  expression: Expression,
): PortraitAppearance {
  return {
    portraitUrl: character?.portraits?.[expression],
    altText: `${character?.name ?? DEFAULT_CHARACTER_NAME}（${resolveExpressionLabel(
      character?.expressions ?? [],
      expression,
    )}）`,
  }
}
