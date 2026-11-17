// 反応の出来事と1行の形と、迎えの挨拶とは別の問い合わせが代ごとに書く反応の行の状態。

import type { Expression } from "../character-pack/expression.ts"

/**
 * 反応する出来事。
 *
 * - `welcome`: 迎える（そのセッションにやり取りがまだ無い）
 * - `retrying`: API の呼び出しを待ってから呼び直している
 * - `failed`: 失敗で閉じた
 * - `limited`: 利用上限で閉じた
 * - `idle`: 依頼を待つ間が続いた（Claude Code が待ちの一言を書かなかったときの控え）
 */
export type ReactionKind = "welcome" | WrittenReactionKind

/** 反応の1行（セリフと、そのときの表情）。 */
export type ReactionLine = {
  readonly text: string
  readonly expression: Expression
}

/** 反応の行の問い合わせが書く出来事（迎えるの行は迎えの挨拶そのもの）。 */
const WRITTEN_REACTION_KINDS = ["retrying", "failed", "limited", "idle"] as const

export type WrittenReactionKind = (typeof WRITTEN_REACTION_KINDS)[number]

/**
 * 出来事ごとに画面が事実を差し込む位置の印。失敗は印を持たない。
 * 再試行は何回目か・利用上限は戻る時刻・待ちは始め方の一覧の先頭の札。
 */
export const REACTION_MARKS = {
  retrying: "{回数}",
  limited: "{時刻}",
  idle: "{札}",
} as const satisfies Partial<Record<WrittenReactionKind, string>>

export type MarkedReactionKind = keyof typeof REACTION_MARKS

/**
 * 印を持つ出来事の1行。
 * `withMark` はその出来事の印をちょうど1つ持ち、`withoutMark` は持たない（値が無いときに出す）。
 */
export type MarkedReactionLine = {
  readonly withMark: string
  readonly withoutMark: string
  readonly expression: Expression
}

/** 書かせた出来事 → 言う1行。失敗だけが印を持たない。 */
export type WrittenReactions = {
  readonly failed: ReactionLine
} & Readonly<Record<MarkedReactionKind, MarkedReactionLine>>

/**
 * 状態に持つ反応の行。
 *
 * - `none`: まだ書けていない（書いている途中・書けなかったも同じで、その出来事では吹き出しを出さない）
 * - `written`: 書けた
 */
export type WrittenReactionsState =
  | { readonly kind: "none" }
  | { readonly kind: "written"; readonly reactions: WrittenReactions }
