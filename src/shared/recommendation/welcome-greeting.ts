// 迎えの挨拶の形と、吹き出しに出す1行の組み立て。
// 挨拶は札の名前を持たず、札があるときの文は名前の位置に差し込み口を1つ持つ。

import type { ReactionLine } from "../character-pack/character-reaction.ts"
import type { Expression } from "../character-pack/expression.ts"

/** 札があるときの文で、先頭の札の名前を差し込む位置。 */
export const WELCOME_GREETING_CARD_MARK = "{札}"

/** 迎えの挨拶1つ。`withCard` は {@link WELCOME_GREETING_CARD_MARK} をちょうど1つ持ち、`withoutCard` は持たない。 */
export type WelcomeGreeting = {
  readonly withCard: string
  readonly withoutCard: string
  readonly expression: Expression
}

/** 状態に持つ挨拶。`none` は届く前（失敗・時間切れも同じ）。 */
export type WelcomeGreetingState =
  | { readonly kind: "none" }
  | { readonly kind: "written"; readonly greeting: WelcomeGreeting }

/** 迎える口の先頭の札。`name` は挨拶に差し込む名前。 */
export type WelcomeHead =
  | { readonly kind: "none" }
  | { readonly kind: "card"; readonly name: string }

export const NO_WELCOME_HEAD = { kind: "none" } as const satisfies WelcomeHead

/** 先頭の札があればその名前を差し込んだ文、無ければ札なしの文。 */
export function welcomeGreetingLine(greeting: WelcomeGreeting, head: WelcomeHead): ReactionLine {
  return {
    text:
      head.kind === "card"
        ? greeting.withCard.replace(WELCOME_GREETING_CARD_MARK, () => head.name)
        : greeting.withoutCard,
    expression: greeting.expression,
  }
}
