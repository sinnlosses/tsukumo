// 機械の出来事に応えるセリフと表情（`character.json` の `reactions` の節）の型と検証。
// `reactions` は丸ごと省略できる任意の節で、持たないパックは反応しない（吹き出しを出さない）。

import { fromKeys, isPlainObject } from "remeda"

import { type Expression, isExpression } from "./expression.ts"

/**
 * 反応する出来事。
 *
 * - `welcome`: 迎える（そのセッションにやり取りがまだ無い）
 * - `accepted`: 依頼を受けた（そのターンでまだ `speak` が無い）
 * - `retrying`: API の呼び出しを待ってから呼び直している
 * - `failed`: 失敗で閉じた
 * - `limited`: 利用上限で閉じた
 * - `idle`: 依頼を待つ間が続いた（本体が待ちの一言を書かなかったときの控え）
 */
export const REACTION_KINDS = [
  "welcome",
  "accepted",
  "retrying",
  "failed",
  "limited",
  "idle",
] as const

export type ReactionKind = (typeof REACTION_KINDS)[number]

/** 反応の1行（セリフと、そのときの表情）。 */
export type ReactionLine = {
  readonly text: string
  readonly expression: Expression
}

/** 出来事 → 言う行の候補。行の無い出来事は空配列。 */
export type CharacterReactions = Readonly<Record<ReactionKind, readonly ReactionLine[]>>

export const NO_REACTIONS = {
  welcome: [],
  accepted: [],
  retrying: [],
  failed: [],
  limited: [],
  idle: [],
} as const satisfies CharacterReactions

/**
 * `character.json` の `reactions` を読む。
 * オブジェクトでなければ全部空、出来事が配列でなければその出来事だけ空にし、形の崩れた1行だけを落とす。
 */
export function toCharacterReactions(value: unknown): CharacterReactions {
  if (!isPlainObject(value)) {
    return NO_REACTIONS
  }
  return fromKeys(REACTION_KINDS, (kind) => toReactionLines(value[kind]))
}

function toReactionLines(value: unknown): readonly ReactionLine[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(toReactionLine).filter((line): line is ReactionLine => line !== undefined)
}

function toReactionLine(value: unknown): ReactionLine | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  const { text, expression } = value
  if (typeof text !== "string" || text.trim() === "") {
    return undefined
  }
  return typeof expression === "string" && isExpression(expression)
    ? { text, expression }
    : undefined
}
