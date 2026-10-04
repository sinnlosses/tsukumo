// いま吹き出しに出す反応（`ShownReaction`）。セッションの姿から導くだけで、状態は持たない。
//
// 反応は `speechExpression`・`speeches`・`records` に書かない（姿が変われば消えるので、戻す処理が要らない）。
// 本物の `speak` が届けば、どの出来事の条件も外れて消える。
// いちばん新しいやり取りについての反応で、過去のターンを見ているかどうかは見ない。
// 迎えるときは、挨拶を書いている途中は「…」、書けていればその文、控えに替わればパックの行を出す。

import type {
  CharacterReactions,
  ReactionKind,
  ReactionLine,
} from "../character-pack/character-reaction.ts"
import { type WelcomeHead, welcomeGreetingLine } from "../recommendation/welcome-greeting.ts"
import { conversationMoment } from "./conversation-moment.ts"
import type { SessionState } from "./session-state.ts"

export type ShownReaction =
  | { readonly kind: "none" }
  /** 迎えの挨拶を書いている途中。吹き出しには「…」を出す。 */
  | { readonly kind: "writing" }
  | { readonly kind: "shown"; readonly reaction: ReactionKind; readonly line: ReactionLine }

const NO_SHOWN_REACTION = { kind: "none" } as const satisfies ShownReaction
const WRITING_REACTION = { kind: "writing" } as const satisfies ShownReaction

/** `head` は迎える口の先頭の札で、迎えの挨拶の名指しに使う。 */
export function shownReaction(state: SessionState, head: WelcomeHead): ShownReaction {
  if (state.chatMode || state.character === undefined) {
    return NO_SHOWN_REACTION
  }
  const reaction = reactionKindOf(state)
  if (reaction === "welcome") {
    return shownWelcomeReaction(
      state.welcomeGreeting,
      state.character.reactions,
      state.nextTurnId,
      head,
    )
  }
  return reaction === "none"
    ? NO_SHOWN_REACTION
    : pickLine(state.character.reactions, reaction, state.nextTurnId)
}

/** 迎えるときの吹き出し。挨拶の状態（`none` / `writing` / `written` / `fallback`）で出し分ける。 */
function shownWelcomeReaction(
  welcomeGreeting: SessionState["welcomeGreeting"],
  reactions: CharacterReactions,
  nextTurnId: number,
  head: WelcomeHead,
): ShownReaction {
  switch (welcomeGreeting.kind) {
    case "written":
      return {
        kind: "shown",
        reaction: "welcome",
        line: welcomeGreetingLine(welcomeGreeting.greeting, head),
      }
    case "writing":
      return WRITING_REACTION
    case "fallback":
      return pickLine(reactions, "welcome", nextTurnId)
    case "none":
      return NO_SHOWN_REACTION
  }
}

function reactionKindOf(state: SessionState): ReactionKind | "none" {
  if (state.apiTrouble.kind === "retrying") {
    return "retrying"
  }
  switch (conversationMoment(state)) {
    case "greet":
      return state.speeches.length === 0 ? "welcome" : "none"
    case "work":
    case "ask":
      return state.turn.kind === "running" && !state.speechCalledInTurn ? "accepted" : "none"
    case "stumble":
      return isLimited(state) ? "limited" : "failed"
    case "deliver":
      return "none"
  }
}

function isLimited(state: SessionState): boolean {
  if (state.rateLimit.kind === "rejected") {
    return true
  }
  return (
    state.turn.kind === "finished" &&
    state.turn.ending.kind === "failed" &&
    state.turn.ending.failure.kind === "api-error" &&
    state.turn.ending.failure.error === "rate_limit"
  )
}

/** 行が複数あれば依頼の通し番号で順に選ぶ（乱数を使わず、描き直しても同じ行になる）。 */
function pickLine(
  reactions: CharacterReactions,
  reaction: ReactionKind,
  seed: number,
): ShownReaction {
  const lines = reactions[reaction]
  const line = lines[seed % Math.max(lines.length, 1)]
  return line === undefined ? NO_SHOWN_REACTION : { kind: "shown", reaction, line }
}
