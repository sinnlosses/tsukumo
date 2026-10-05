// いま吹き出しに出す反応（`ShownReaction`）。セッションの姿と「今」から導くだけで、状態は持たない。
//
// 反応は `speechExpression`・`speeches`・`records` に書かない（姿が変われば消えるので、戻す処理が要らない）。
// 本物の `speak` が届けば、どの出来事の条件も外れて消える。
// いちばん新しいやり取りについての反応で、過去のターンを見ているかどうかは見ない。
// 迎えるときは、挨拶を書いている途中は「…」、書けていればその文、控えに替わればパックの行を出す。
// 依頼を待つ間が続いたら、本体が `report` に書いた待ちの一言、無ければパックの待ちの行を出す。
// 続きから起こしてまだ依頼が無い間は、前回の待ちの一言、無ければ迎えの挨拶の札の無い文をおかえりとして出す。

import type {
  CharacterReactions,
  ReactionKind,
  ReactionLine,
} from "../character-pack/character-reaction.ts"
import {
  NO_WELCOME_HEAD,
  type WelcomeHead,
  welcomeGreetingLine,
} from "../recommendation/welcome-greeting.ts"
import { conversationMoment } from "./conversation-moment.ts"
import type { ReportWaitingLine } from "./session-event.ts"
import type { SessionRecord, SessionState } from "./session-state.ts"

export type ShownReaction =
  | { readonly kind: "none" }
  /** 迎えの挨拶を書いている途中。吹き出しには「…」を出す。 */
  | { readonly kind: "writing" }
  | { readonly kind: "shown"; readonly reaction: ReactionKind; readonly line: ReactionLine }

/** ターンが閉じて依頼を待つ間がこのミリ秒続いたら、待ちの一言を出す。 */
export const WAITING_LINE_DELAY_MS = 120_000

const NO_SHOWN_REACTION = { kind: "none" } as const satisfies ShownReaction
const WRITING_REACTION = { kind: "writing" } as const satisfies ShownReaction
const NO_WAITING_LINE = { kind: "none" } as const satisfies ReportWaitingLine

/**
 * `head` は迎える口の先頭の札で、迎えの挨拶の名指しに使う。
 * `now` は呼び出し側が渡す現在時刻（エポックミリ秒）で、待ちの一言を出すかだけに使う。
 */
export function shownReaction(state: SessionState, head: WelcomeHead, now: number): ShownReaction {
  if (state.chatMode || state.character === undefined) {
    return NO_SHOWN_REACTION
  }
  const reaction = reactionKindOf(state, now)
  switch (reaction) {
    case "welcome":
      return shownWelcomeReaction(
        state.welcomeGreeting,
        state.character.reactions,
        state.nextTurnId,
        head,
      )
    case "welcome-back":
      return shownWelcomeBack(state, state.character.reactions)
    case "idle":
      return shownWaitingLine(state.records, state.character.reactions, state.nextTurnId)
    case "none":
      return NO_SHOWN_REACTION
    default:
      return pickLine(state.character.reactions, reaction, state.nextTurnId)
  }
}

/**
 * 待ちの一言を出し始める時刻（エポックミリ秒）。ターンが閉じた時刻から {@link WAITING_LINE_DELAY_MS} 後。
 * 依頼を待つ間（局面が渡す）でない・雑談・いちばん新しい依頼が組み直した記録（続きから起こした直後）なら undefined。
 *
 * 時刻が来た瞬間には何のイベントも来ないので、呼び出し側はこの時刻に1回描き直す。
 */
export function waitingLineDueAt(state: SessionState): number | undefined {
  if (state.chatMode || state.turn.kind !== "finished" || conversationMoment(state) !== "deliver") {
    return undefined
  }
  if (!state.records.some(isRequestRecord) || isResumedWithoutRequest(state.records)) {
    return undefined
  }
  return state.turn.finishedAt + WAITING_LINE_DELAY_MS
}

/** いちばん新しい依頼が組み直した記録か（続きから起こして、まだ依頼を送っていない）。 */
function isResumedWithoutRequest(records: readonly SessionRecord[]): boolean {
  return records.findLast(isRequestRecord)?.time.kind === "restored"
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

/**
 * 続きから起こしてまだ依頼が無い間の吹き出し（おかえり）。
 * 前回の待ちの一言、無ければ迎えの挨拶の札の無い文（迎える口の札が出ない局面のため）。
 */
function shownWelcomeBack(state: SessionState, reactions: CharacterReactions): ShownReaction {
  const waitingLine = lastWaitingLine(state.records)
  return waitingLine.kind === "speech"
    ? { kind: "shown", reaction: "welcome", line: reactionLineOf(waitingLine) }
    : shownWelcomeReaction(state.welcomeGreeting, reactions, state.nextTurnId, NO_WELCOME_HEAD)
}

/** 依頼を待つ間の吹き出し。いちばん新しい依頼より後の最後の `report` の待ちの一言、無ければパックの待ちの行。 */
function shownWaitingLine(
  records: readonly SessionRecord[],
  reactions: CharacterReactions,
  nextTurnId: number,
): ShownReaction {
  const waitingLine = lastWaitingLine(records)
  return waitingLine.kind === "speech"
    ? { kind: "shown", reaction: "idle", line: reactionLineOf(waitingLine) }
    : pickLine(reactions, "idle", nextTurnId)
}

/** いちばん新しい依頼より後の最後の `report` の待ちの一言。`report` が無ければ書かれていないのと同じ `none`。 */
function lastWaitingLine(records: readonly SessionRecord[]): ReportWaitingLine {
  const report = records
    .slice(records.findLastIndex(isRequestRecord) + 1)
    .findLast((record) => record.kind === "report")
  return report?.kind === "report" ? report.waitingLine : NO_WAITING_LINE
}

function reactionLineOf({ text, expression }: ReactionLine): ReactionLine {
  return { text, expression }
}

function reactionKindOf(state: SessionState, now: number): ReactionKind | "welcome-back" | "none" {
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
    case "deliver": {
      if (isResumedWithoutRequest(state.records)) {
        return "welcome-back"
      }
      const dueAt = waitingLineDueAt(state)
      return dueAt !== undefined && now >= dueAt ? "idle" : "none"
    }
  }
}

function isRequestRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "request" }> {
  return record.kind === "request"
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
