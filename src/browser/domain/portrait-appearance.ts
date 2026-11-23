// キャラクター・表情から、立ち絵の見た目（URL・代替テキスト）を導く。
import type { CharacterInfo } from "../../shared/character-pack/character.ts"
import { expressionRoleName } from "../../shared/character-pack/expression-choice.ts"
import type { Expression } from "../../shared/character-pack/expression.ts"

/** character.json に `name` が無い・定義自体が無いときの、キャラクターの既定の呼び名。 */
export const DEFAULT_CHARACTER_NAME = "キャラクター"

export type PortraitAppearance = {
  /** 立ち絵の素材 URL。character が届いていなければ undefined（吹き出しだけで成立させる）。 */
  readonly portraitUrl?: string
  readonly altText: string
}

/**
 * 表情から立ち絵の見た目を組み立てる。代替テキストは名前と表情の役割の名（パックのラベルは入れない）。
 */
export function portraitAppearance(
  character: CharacterInfo | undefined,
  expression: Expression,
): PortraitAppearance {
  return {
    portraitUrl: character?.portraits?.[expression],
    altText: `${character?.name ?? DEFAULT_CHARACTER_NAME}（${expressionRoleName(expression)}）`,
  }
}
