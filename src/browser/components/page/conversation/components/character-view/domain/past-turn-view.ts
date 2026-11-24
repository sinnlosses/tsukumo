// 立ち絵とセリフの吹き出しが見せるセリフと表情を選ぶ。
// 過去のターンのタブを選んでいる間は、そのターンの最後のセリフと表情に戻す。
// 留めた行があれば、その行の表情を当てる。

import type { Expression } from "../../../../../../../shared/character-pack/expression.ts"
import type { ShownReaction } from "../../../../../../../shared/session/shown-reaction.ts"
import type { Speech, TurnSpeech } from "../../../../../../../shared/session/turn-speech.ts"
import {
  pinnedSpeechOf,
  resolvePinnedSpeech,
  type PinnedSpeech,
  type ViewedSpeech,
} from "../../../domain/pinned-speech.ts"

/** そのターンにセリフが1件も無かったときに当てる表情（`INITIAL_SESSION_STATE` と同じ既定）。 */
const DEFAULT_PAST_TURN_EXPRESSION = "default"

export type ViewedSpeechInput = {
  readonly turns: readonly TurnSpeech[]
  readonly activeTurnId?: number
  readonly newestTurnId?: number
  readonly speeches: readonly Speech[]
  readonly speechExpression: Expression
  readonly latestReaction: ShownReaction
  readonly viewed: ViewedSpeech
  readonly speechesOfTurn: Parameters<typeof resolvePinnedSpeech>[1]
}

export type ViewedSpeechResult = {
  readonly activeSpeeches: readonly Speech[]
  readonly reaction: ShownReaction
  readonly expression: Expression
  /** 留めた行のセリフ。 */
  readonly pinnedSpeech?: Speech
  /** 留めた行の位置。 */
  readonly pinned?: PinnedSpeech
}

export function viewedSpeechOf(input: ViewedSpeechInput): ViewedSpeechResult {
  const { turns, activeTurnId, newestTurnId, speeches, speechExpression, latestReaction, viewed } =
    input
  const pastTurn =
    activeTurnId === undefined || newestTurnId === undefined
      ? undefined
      : pastTurnSpeech(turns, activeTurnId, newestTurnId)
  const activeSpeeches = pastTurn === undefined ? speeches : pastTurn.speeches
  const reaction: ShownReaction = pastTurn === undefined ? latestReaction : { kind: "none" }
  // 過去のターンでは、記録に残った表情（そのターンの最後のセリフのもの）をそのまま当てる。
  const currentExpression = reaction.kind === "shown" ? reaction.line.expression : speechExpression
  const fallbackExpression =
    pastTurn === undefined
      ? currentExpression
      : (pastTurn.expression ?? DEFAULT_PAST_TURN_EXPRESSION)
  const pinnedSpeech = resolvePinnedSpeech(viewed, input.speechesOfTurn)
  // 失効した印を古い行に残すと、表情（最新に戻る）と印の位置が食い違う。
  const pinned = pinnedSpeech === undefined ? undefined : pinnedSpeechOf(viewed)
  return {
    activeSpeeches,
    reaction,
    expression: pinnedSpeech?.expression ?? fallbackExpression,
    pinnedSpeech,
    pinned,
  }
}

/**
 * 過去のターンを見ているときだけ、そのターンのセリフ（出し始めた反応を含む）と表情を返す（今回を見ていれば undefined）。
 * 今のターンを記録から導き直さないのは、`request` で空に戻るなどの規則が `SessionState.speeches` 側にしか無いため。
 */
function pastTurnSpeech(
  turns: readonly TurnSpeech[],
  activeTurnId: number,
  newestTurnId: number,
): TurnSpeech | undefined {
  if (activeTurnId === newestTurnId) {
    return undefined
  }
  return turns.find((turn) => turn.id === activeTurnId)
}
