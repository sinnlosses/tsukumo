// 迎えの挨拶と、同じ問い合わせで書かせる反応の行の形と、吹き出しに出す1行の組み立て。
// 挨拶は札の名前を持たず、札があるときの文は名前の位置に差し込み口を1つ持つ。

import type { Expression } from "../character-pack/expression.ts"

/**
 * 反応する出来事。
 *
 * - `welcome`: 迎える（そのセッションにやり取りがまだ無い）
 * - `retrying`: API の呼び出しを待ってから呼び直している
 * - `failed`: 失敗で閉じた
 * - `limited`: 利用上限で閉じた
 * - `idle`: 依頼を待つ間が続いた（本体が待ちの一言を書かなかったときの控え）
 */
export type ReactionKind = "welcome" | WrittenReactionKind

/** 反応の1行（セリフと、そのときの表情）。 */
export type ReactionLine = {
  readonly text: string
  readonly expression: Expression
}

/** 挨拶と同じ問い合わせで、そのセッション用に書かせる出来事（迎えるの行は挨拶そのもの）。 */
export const WRITTEN_REACTION_KINDS = ["retrying", "failed", "limited", "idle"] as const

export type WrittenReactionKind = (typeof WRITTEN_REACTION_KINDS)[number]

/** 書かせた出来事 → 言う1行。 */
export type WrittenReactions = Readonly<Record<WrittenReactionKind, ReactionLine>>

/** 札があるときの文で、先頭の札の名前を差し込む位置。 */
export const WELCOME_GREETING_CARD_MARK = "{札}"

/**
 * 迎えの挨拶1つと、同じ答えで書かせた反応の行。
 * `withCard` は {@link WELCOME_GREETING_CARD_MARK} をちょうど1つ持ち、`withoutCard` と反応の行は持たない。
 */
export type WelcomeGreeting = {
  readonly withCard: string
  readonly withoutCard: string
  readonly expression: Expression
  readonly reactions: WrittenReactions
}

/**
 * 状態に持つ挨拶。
 *
 * - `none`: 書き始める前（または起こし直し・`/clear` の直後でまだ書き始めていない）
 * - `writing`: 書いている途中（吹き出しには「…」を出す）
 * - `written`: 書けた
 * - `unwritten`: 問い合わせ直しも失敗、または15秒の締め切りを過ぎた（挨拶も反応の行も出さない）
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
