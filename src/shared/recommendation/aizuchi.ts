// 相づち（立ち絵の右上に出る短い返事の札と、押したときの返事）の局面の表と、代の始めに書いた組・押した勘定の状態。

import type { Expression } from "../character-pack/expression.ts"
import type { ReactionLine } from "./reaction.ts"

/** 局面ごとに書いておく組の数。 */
export const AIZUCHI_PAIRS_PER_MOMENT = 3

/** 札を出す局面 → 一度に出す札の数。ここに無い局面（`greet`・`ask`）には出さない。 */
export const AIZUCHI_MOMENTS = {
  deliver: 2,
  stumble: 1,
  work: 1,
} as const satisfies Record<string, number>

export type AizuchiMoment = keyof typeof AIZUCHI_MOMENTS

/** 札を出す局面の名前（契約の入力の列挙に使う）。 */
export const AIZUCHI_MOMENT_NAMES = [
  "deliver",
  "stumble",
  "work",
] as const satisfies readonly AizuchiMoment[]

/** 局面の名前が札を出す局面か。 */
export function isAizuchiMoment(moment: string): moment is AizuchiMoment {
  return moment in AIZUCHI_MOMENTS
}

/** 札の文（利用者の言葉）と、押したときの返事とその表情。 */
export type AizuchiPair = {
  readonly chip: string
  readonly reply: string
  readonly expression: Expression
}

/** 局面ごとの書いた組（前から順に出す）。 */
export type AizuchiPairs = Readonly<Record<AizuchiMoment, readonly AizuchiPair[]>>

/** 局面ごとに、その代で押した組の番号。 */
export type AizuchiPressed = Readonly<Record<AizuchiMoment, readonly number[]>>

const NOTHING_PRESSED = {
  deliver: [],
  stumble: [],
  work: [],
} as const satisfies AizuchiPressed

/**
 * いま吹き出しに出している押した返事。押した時点の姿の印（ターンの通し番号・終わった数・セリフの数）を持ち、
 * 局面が替わる・新しいターンが始まる・本物の `speak` が届くと印が合わなくなって消える。
 */
export type AizuchiAnswer = {
  readonly moment: AizuchiMoment
  readonly line: ReactionLine
  readonly nextTurnId: number
  readonly finishedTurnCount: number
  readonly speechCount: number
}

/** 書き手が覚えておく相づち（押した勘定は持たない）。書けていなければ `none`。 */
export type WrittenAizuchi =
  | { readonly kind: "none" }
  | { readonly kind: "written"; readonly pairs: AizuchiPairs }

/**
 * 状態に持つ相づち。
 *
 * - `none`: まだ書けていない（書いている途中・書けなかったも同じで、札を出さない）
 * - `written`: 書けた。`answer` は押したあと、いまの局面にいるあいだだけ印が合う
 */
export type AizuchiState =
  | { readonly kind: "none" }
  | {
      readonly kind: "written"
      readonly pairs: AizuchiPairs
      readonly pressed: AizuchiPressed
      readonly answer?: AizuchiAnswer
    }

/** 書けた直後の状態。 */
export function writtenAizuchi(pairs: AizuchiPairs): AizuchiState {
  return { kind: "written", pairs, pressed: NOTHING_PRESSED }
}

/** 押された札の組。書けていない・番号が無い・その代で押し済みなら `none`。 */
export type PressablePair =
  | { readonly kind: "none" }
  | { readonly kind: "pressable"; readonly pair: AizuchiPair }

export function pressablePair(
  state: AizuchiState,
  moment: AizuchiMoment,
  index: number,
): PressablePair {
  if (state.kind !== "written" || state.pressed[moment].includes(index)) {
    return { kind: "none" }
  }
  const pair = state.pairs[moment][index]
  return pair === undefined ? { kind: "none" } : { kind: "pressable", pair }
}
