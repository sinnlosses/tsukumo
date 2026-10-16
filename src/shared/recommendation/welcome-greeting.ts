// 迎えの挨拶の形と、吹き出しに出す1行の組み立て。
// 挨拶は札の名前を持たず、札があるときの文は名前の位置に差し込み口を1つ持つ。

import type { Expression } from "../character-pack/expression.ts"
import type { ReactionLine } from "./reaction.ts"

/** 札があるときの文で、先頭の札の名前を差し込む位置。 */
export const WELCOME_GREETING_CARD_MARK = "{札}"

/**
 * 迎えの挨拶1つ。
 * `withCard` は {@link WELCOME_GREETING_CARD_MARK} をちょうど1つ持ち、`withoutCard` は持たない。
 */
export type WelcomeGreeting = {
  readonly withCard: string
  readonly withoutCard: string
  readonly expression: Expression
}

/**
 * 状態に持つ挨拶。
 *
 * - `none`: 書き始める前（または起こし直し・`/clear` の直後でまだ書き始めていない）
 * - `writing`: 書いている途中（吹き出しには「…」を出す）
 * - `written`: 書けた
 * - `unwritten`: 問い合わせ直しも失敗、または15秒の締め切りを過ぎた（挨拶を出さない）
 */
export type WelcomeGreetingState =
  | { readonly kind: "none" }
  | { readonly kind: "writing" }
  | { readonly kind: "written"; readonly greeting: WelcomeGreeting }
  | { readonly kind: "unwritten" }

/** 迎える口の先頭の札。`name` は挨拶に差し込む名前。 */
export type WelcomeHead =
  | { readonly kind: "none" }
  | { readonly kind: "card"; readonly name: string }

export const NO_WELCOME_HEAD = { kind: "none" } as const satisfies WelcomeHead

/** 画面が表示した挨拶の1行として受け取る文の上限（文字）。運ぶための素朴な上限で、形は {@link isWelcomeGreetingLine} が見る。 */
export const MAX_SHOWN_WELCOME_GREETING_LENGTH = 200

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

/**
 * その1行が、この挨拶から {@link welcomeGreetingLine} で組める文か。
 * 札なしの文そのものか、札ありの文の差し込み口に空でない名前を差し込んだ文で、表情も挨拶のものに限る。
 */
export function isWelcomeGreetingLine(greeting: WelcomeGreeting, line: ReactionLine): boolean {
  if (line.expression !== greeting.expression) {
    return false
  }
  if (line.text === greeting.withoutCard) {
    return true
  }
  const mark = greeting.withCard.indexOf(WELCOME_GREETING_CARD_MARK)
  if (mark < 0) {
    return false
  }
  const before = greeting.withCard.slice(0, mark)
  const after = greeting.withCard.slice(mark + WELCOME_GREETING_CARD_MARK.length)
  return (
    line.text.length > before.length + after.length &&
    line.text.startsWith(before) &&
    line.text.endsWith(after)
  )
}
