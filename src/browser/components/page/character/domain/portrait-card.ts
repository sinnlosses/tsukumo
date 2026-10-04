// 表情のカードの並び。

import type { CharacterInfo } from "../../../../../shared/character-pack/character.ts"
import { resolveExpressionLabel } from "../../../../../shared/character-pack/expression-choice.ts"
import {
  type Expression,
  EXPRESSIONS,
  isRemovableExpression,
  type RemovableExpression,
} from "../../../../../shared/character-pack/expression.ts"
import { DEFAULT_EXPRESSION_BADGE, GALLERY_OUTFIT } from "./character-edit-copy.ts"
import type { PortraitCardModel } from "./character-edit-model.ts"
import { readFile, readPicked } from "./picked-image.ts"

/** カードから送る2つ（どちらも選んでいるパックへ書く）。 */
export type PortraitSenders = {
  readonly pick: (expression: Expression, image: string) => void
  readonly clear: (expression: RemovableExpression) => void
}

/** 表情のカードを `EXPRESSIONS` の順に畳む。 */
export function portraitCards(
  character: CharacterInfo,
  galleryAccent: string,
  send: PortraitSenders,
): readonly PortraitCardModel[] {
  // `default` は消せないので1回だけ解けばよい（消す前の確かめの本文がどのカードでも同じ値を読む）。
  const fallbackLabel = resolveExpressionLabel(character.expressions, "default")
  return EXPRESSIONS.map((expression): PortraitCardModel => {
    const label = resolveExpressionLabel(character.expressions, expression)
    // 畳んだ表では `default` の絵が入っているので、自分の絵を持つ表情だけを引く。
    const url = character.expressionsWithPortrait.includes(expression)
      ? character.portraits?.[expression]
      : undefined
    const sendImage = (image: string): void => {
      send.pick(expression, image)
    }
    return {
      expression,
      label,
      badge:
        expression === "default"
          ? { kind: "shown", text: DEFAULT_EXPRESSION_BADGE }
          : { kind: "none" },
      image:
        url === undefined
          ? { kind: "blank" }
          : { kind: "shown", url, accent: galleryAccent, outfit: GALLERY_OUTFIT },
      pickAriaLabel: `${label}を${url === undefined ? "選ぶ" : "差し替える"}`,
      onPick: (input) => {
        void readPicked(input, sendImage)
      },
      onDropFile: (file) => {
        void readFile(file, sendImage)
      },
      clear:
        isRemovableExpression(expression) && url !== undefined
          ? {
              kind: "shown",
              ariaLabel: `${label}を消す`,
              fallbackLabel,
              onClear: clearOf(expression, send),
            }
          : { kind: "hidden" },
    }
  })
}

/** 消す口の呼び先（消せる表情に絞ったあとで作る。閉包の中では絞り込みが効かないため）。 */
function clearOf(expression: RemovableExpression, send: PortraitSenders): () => void {
  return () => {
    send.clear(expression)
  }
}
