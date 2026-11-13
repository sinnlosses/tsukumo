// いま立ち絵のそばに出す相づちの札と、押したあとに吹き出しへ出す返事。セッションの状態から導くだけで、別の状態は持たない。

import { AIZUCHI_MOMENTS, type AizuchiMoment, isAizuchiMoment } from "../recommendation/aizuchi.ts"
import type { ReactionLine } from "../recommendation/reaction.ts"
import { conversationMoment } from "./conversation-moment.ts"
import type { SessionState } from "./session-state.ts"

/** 出している札。`index` は局面の組の何番目か（押すときに渡す）。 */
export type ShownAizuchiChip = {
  readonly moment: AizuchiMoment
  readonly index: number
  readonly chip: string
}

/**
 * いまの局面に出す札。その代でまだ押していない組を前から順に、局面の表の枚数だけ。
 * 押した返事を出しているあいだ（{@link shownAizuchiAnswer}）は出さない。
 * 雑談・書けていない代・表に無い局面（`greet`・`ask`）は空。
 * 過去のやり取りを見ているあいだに出さないのは画面の側で決める。
 */
export function shownAizuchi(state: SessionState): readonly ShownAizuchiChip[] {
  const { aizuchi } = state
  const moment = conversationMoment(state)
  if (
    state.chatMode ||
    aizuchi.kind !== "written" ||
    !isAizuchiMoment(moment) ||
    answeredInThisMoment(state)
  ) {
    return []
  }
  return aizuchi.pairs[moment]
    .map((pair, index) => ({ moment, index, chip: pair.chip }))
    .filter(({ index }) => !aizuchi.pressed[moment].includes(index))
    .slice(0, AIZUCHI_MOMENTS[moment])
}

/**
 * 押した返事のうち、いま吹き出しに出すもの。
 * 局面・ターンの通し番号・終わったターンの数・セリフの数が押した時点と同じあいだだけ出る
 * （局面が替わる・新しいターンが始まる・本物の `speak` が届くと消える）。
 */
export function shownAizuchiAnswer(state: SessionState): ShownAizuchiAnswer {
  const { aizuchi } = state
  if (aizuchi.kind !== "written" || aizuchi.answer === undefined) {
    return NO_ANSWER
  }
  const { answer } = aizuchi
  return answeredInThisMoment(state) && answer.speechCount === state.speeches.length
    ? { kind: "shown", line: answer.line }
    : NO_ANSWER
}

export type ShownAizuchiAnswer =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly line: ReactionLine }

const NO_ANSWER = { kind: "none" } as const satisfies ShownAizuchiAnswer

/** 押した時点と同じ局面・同じターンのままか（札を引っ込めるあいだ）。 */
function answeredInThisMoment(state: SessionState): boolean {
  const { aizuchi } = state
  if (aizuchi.kind !== "written" || aizuchi.answer === undefined) {
    return false
  }
  const { answer } = aizuchi
  return (
    answer.moment === conversationMoment(state) &&
    answer.nextTurnId === state.nextTurnId &&
    answer.finishedTurnCount === state.finishedTurnCount
  )
}
