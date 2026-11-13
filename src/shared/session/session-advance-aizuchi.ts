// 相づちの出来事（書けた・押した）で姿をどう進めるか。

import { type AizuchiPairs, pressablePair, writtenAizuchi } from "../recommendation/aizuchi.ts"
import type { SessionEvent } from "./session-event.ts"
import type { SessionState } from "./session-state.ts"

export function advanceByAizuchiWritten(state: SessionState, pairs: AizuchiPairs): SessionState {
  return { ...state, aizuchi: writtenAizuchi(pairs) }
}

/** 押した組を押し済みに数え、返事を吹き出しに出す印（いまの姿）を持つ。押せない組なら動かさない。 */
export function advanceByAizuchiPressed(
  state: SessionState,
  event: Extract<SessionEvent, { readonly kind: "aizuchi-pressed" }>,
): SessionState {
  const { aizuchi } = state
  const found = pressablePair(aizuchi, event.moment, event.index)
  if (aizuchi.kind !== "written" || found.kind === "none") {
    return state
  }
  return {
    ...state,
    aizuchi: {
      ...aizuchi,
      pressed: {
        ...aizuchi.pressed,
        [event.moment]: [...aizuchi.pressed[event.moment], event.index],
      },
      answer: {
        moment: event.moment,
        line: { text: found.pair.reply, expression: found.pair.expression },
        nextTurnId: state.nextTurnId,
        finishedTurnCount: state.finishedTurnCount,
        speechCount: state.speeches.length,
      },
    },
  }
}
