// いま吹き出しに出す反応（`ShownReaction`）。セッションの状態と「今」から導くだけで、別の状態は持たない。
//
// 反応は `speechExpression`・`speeches` に書かない（姿が変われば消えるので、戻す処理が要らない）。
// 出し始めた行を記録（`reaction`）に積むのは `applySessionEvent`。
// 本物の `speak` が届けば、どの出来事の条件も外れて消える。
// いちばん新しいやり取りについての反応で、過去のターンを見ているかどうかは見ない。
// 迎えるときは、挨拶を書いている途中は「…」、書けていればその文を出し、書けなかったら出さない。
// 依頼を受けてから最初の `speak` までは「…」を出す。
// 再試行・失敗・利用上限は、反応の行の問い合わせが書いた行を出し、書けていなければ出さない（挨拶が書けたかは見ない）。
// 再試行・利用上限・待ちの行は印を持つ文を持ち、値（回数・戻る時刻・先頭の札）が取れれば差し込み、取れなければ印の無い文を出す。
// 依頼を待つ間が続いたら、Claude Code が `report` に書いた待ちの一言、無ければ書かせた待ちの行を出す。
// 続きから起こしてまだ依頼が無い間は、前回の待ちの一言、無ければ迎えの挨拶の札の無い文をおかえりとして出す。

import {
  type MarkedReactionKind,
  REACTION_MARKS,
  type ReactionKind,
  type ReactionLine,
  type WrittenReactionKind,
} from "../recommendation/reaction.ts"
import {
  NO_WELCOME_HEAD,
  type WelcomeGreeting,
  type WelcomeHead,
  welcomeGreetingLine,
} from "../recommendation/welcome-greeting.ts"
import { conversationMoment } from "./conversation-moment.ts"
import type { ReportWaitingLine } from "./session-event-report.ts"
import type { RecordTime, SessionRecord } from "./session-record.ts"
import type { SessionState } from "./session-state.ts"
import { waitingLineDelayMs } from "./speaking-pace.ts"

export type ShownReaction =
  | { readonly kind: "none" }
  /** 迎えの挨拶を書いている途中と、依頼を受けて最初の `speak` までの間。吹き出しには「…」を出す。 */
  | { readonly kind: "writing" }
  | {
      readonly kind: "shown"
      readonly reaction: ReactionKind
      readonly line: ReactionLine
      /** 出し始めた時刻。分からなければ（続きから起こした直後のおかえりなど）`restored`。 */
      readonly time: RecordTime
    }

/** 迎える局面で吹き出しに出している迎えの挨拶。続きから起こした直後のおかえりは含めない。 */
export type GreetingOnShow =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly greeting: WelcomeGreeting }

type UntimedReaction =
  | Exclude<ShownReaction, { readonly kind: "shown" }>
  | { readonly kind: "shown"; readonly reaction: ReactionKind; readonly line: ReactionLine }

/** 戻る時刻（エポックミリ秒）と現在時刻から、画面に出す時刻の字を組む。 */
export type ResetTimeText = (resetsAt: number, now: number) => string

type ReactionValues = {
  readonly head: WelcomeHead
  readonly now: number
  readonly resetTimeText?: ResetTimeText
}

const NO_SHOWN_REACTION = { kind: "none" } as const satisfies ShownReaction
const WRITING_REACTION = { kind: "writing" } as const satisfies ShownReaction
const NO_WAITING_LINE = { kind: "none" } as const satisfies ReportWaitingLine
const UNKNOWN_TIME = { kind: "restored" } as const satisfies RecordTime
const NO_GREETING_ON_SHOW = { kind: "none" } as const satisfies GreetingOnShow

/**
 * `head` は始め方の一覧の先頭の札で、迎えの挨拶の名指しに使う。
 * `now` は呼び出し側が渡す現在時刻（エポックミリ秒）で、待ちの一言を出すかと、戻る時刻の字を組むのに使う。
 * `resetTimeText` は利用上限の戻る時刻を読む人の時計の字にする関数で、無ければ戻る時刻は差し込まない（読む人の時計を持つ画面だけが渡す）。
 */
export function shownReaction(
  state: SessionState,
  head: WelcomeHead,
  now: number,
  resetTimeText?: ResetTimeText,
): ShownReaction {
  const reaction = untimedReaction(state, { head, now, resetTimeText })
  return reaction.kind === "shown"
    ? { ...reaction, time: reactionTime(state, reaction.reaction) }
    : reaction
}

/** いま吹き出しが迎えの挨拶（札で文が変わるもの）を出しているなら、その挨拶。 */
export function greetingOnShow(state: SessionState): GreetingOnShow {
  const { welcomeGreeting } = state
  return welcomeGreeting.kind === "written" && isGreeting(state)
    ? { kind: "shown", greeting: welcomeGreeting.greeting }
    : NO_GREETING_ON_SHOW
}

/**
 * 待ちの一言を出し始める時刻（エポックミリ秒）。ターンが閉じた時刻から、このセッションを起こしたときの待ちの一言の間だけ後。
 * 依頼を待つ間（局面が渡す）でない・雑談・間が「出さない」・いちばん新しい依頼が組み直した記録（続きから起こした直後）なら undefined。
 *
 * 時刻が来た瞬間には何のイベントも来ないので、ブラウザはこの時刻に1回描き直し、サーバはこの時刻に `waiting-line-due` を流す。
 */
export function waitingLineDueAt(state: SessionState): number | undefined {
  if (state.chatMode || state.turn.kind !== "finished" || conversationMoment(state) !== "deliver") {
    return undefined
  }
  if (!state.records.some(isRequestRecord) || isResumedWithoutRequest(state.records)) {
    return undefined
  }
  const delay = waitingLineDelayMs(state.speakingPace.launchedWaitingLine)
  return delay === undefined ? undefined : state.turn.finishedAt + delay
}

/**
 * 出している反応を出し始めた時刻。
 * 積んだ同じ種類の記録があればその時刻（セリフのログと同じ時刻を出すため）。
 * 記録がまだ無ければ姿から導く: 再試行は呼び直しが始まった時刻、失敗と利用上限はターンが閉じた時刻、待ちの一言は出す時刻、迎えるは分からない。
 */
function reactionTime(state: SessionState, reaction: ReactionKind): RecordTime {
  return recordedReaction(state, reaction)?.time ?? derivedReactionTime(state, reaction)
}

/**
 * いま出している反応にあたる、積んだ記録。いちばん新しい依頼より後の、同じ種類の最後の1件。
 * 待ちの一言は待つたびに積むので、ターンが閉じたあとに積んだものに限る（前の待ちの記録を拾わない）。
 */
function recordedReaction(
  state: SessionState,
  reaction: ReactionKind,
): Extract<SessionRecord, { readonly kind: "reaction" }> | undefined {
  const { records, turn } = state
  const recorded = records
    .slice(records.findLastIndex(isRequestRecord) + 1)
    .findLast((record) => record.kind === "reaction" && record.reaction === reaction)
  if (recorded?.kind !== "reaction") {
    return undefined
  }
  if (reaction !== "idle") {
    return recorded
  }
  return turn.kind === "finished" &&
    recorded.time.kind === "stamped" &&
    recorded.time.at >= turn.finishedAt
    ? recorded
    : undefined
}

function derivedReactionTime(state: SessionState, reaction: ReactionKind): RecordTime {
  switch (reaction) {
    case "retrying":
      return state.apiTrouble.kind === "retrying"
        ? { kind: "stamped", at: state.apiTrouble.at }
        : UNKNOWN_TIME
    case "failed":
    case "limited":
      return state.turn.kind === "finished"
        ? { kind: "stamped", at: state.turn.finishedAt }
        : UNKNOWN_TIME
    case "idle": {
      const dueAt = waitingLineDueAt(state)
      return dueAt === undefined ? UNKNOWN_TIME : { kind: "stamped", at: dueAt }
    }
    case "welcome":
      return UNKNOWN_TIME
  }
}

function untimedReaction(state: SessionState, values: ReactionValues): UntimedReaction {
  if (state.chatMode || state.character === undefined) {
    return NO_SHOWN_REACTION
  }
  const { head, now } = values
  const reaction = reactionKindOf(state, now)
  switch (reaction) {
    case "welcome":
      return shownWelcomeReaction(state.welcomeGreeting, head)
    case "welcome-back":
      return shownWelcomeBack(state)
    case "idle":
      return shownWaitingLine(state, values)
    case "accepted":
      return WRITING_REACTION
    case "none":
      return NO_SHOWN_REACTION
    default:
      return shownWrittenLine(state, reaction, values)
  }
}

/** いちばん新しい依頼が組み直した記録か（続きから起こして、まだ依頼を送っていない）。 */
function isResumedWithoutRequest(records: readonly SessionRecord[]): boolean {
  const latest = records.findLast(isRequestRecord)
  return latest !== undefined && latest.time.kind !== "stamped"
}

/** 迎えるときの吹き出し。挨拶の状態（`none` / `writing` / `written` / `unwritten`）で出し分ける。 */
function shownWelcomeReaction(
  welcomeGreeting: SessionState["welcomeGreeting"],
  head: WelcomeHead,
): UntimedReaction {
  switch (welcomeGreeting.kind) {
    case "written":
      return {
        kind: "shown",
        reaction: "welcome",
        line: welcomeGreetingLine(welcomeGreeting.greeting, head),
      }
    case "writing":
      return WRITING_REACTION
    case "unwritten":
    case "none":
      return NO_SHOWN_REACTION
  }
}

/**
 * 続きから起こしてまだ依頼が無い間の吹き出し（おかえり）。
 * 前回の待ちの一言、無ければ迎えの挨拶の札の無い文（始め方の一覧の札が出ない局面のため）。
 */
function shownWelcomeBack(state: SessionState): UntimedReaction {
  const waitingLine = lastWaitingLine(state.records)
  return waitingLine.kind === "speech"
    ? { kind: "shown", reaction: "welcome", line: reactionLineOf(waitingLine) }
    : shownWelcomeReaction(state.welcomeGreeting, NO_WELCOME_HEAD)
}

/**
 * 依頼を待つ間の吹き出し。いちばん新しい依頼より後の最後の `report` の待ちの一言、
 * 無ければ書かせた待ちの行、それも書けていなければ tsukumo の既定の1文。
 */
function shownWaitingLine(state: SessionState, values: ReactionValues): UntimedReaction {
  const waitingLine = lastWaitingLine(state.records)
  if (waitingLine.kind === "speech") {
    return { kind: "shown", reaction: "idle", line: reactionLineOf(waitingLine) }
  }
  return state.writtenReactions.kind === "written"
    ? shownWrittenLine(state, "idle", values)
    : { kind: "shown", reaction: "idle", line: DEFAULT_WAITING_LINE }
}

/** 待ちの一言を `report` も反応の行の問い合わせも渡せなかったときの、キャラクターに依らない中立の1文。 */
const DEFAULT_WAITING_LINE = {
  text: "次の依頼を待っている。",
  expression: "default",
} as const satisfies ReactionLine

/**
 * 反応の行の問い合わせが書いた行。書けていなければ出さない。
 * 印を持つ出来事は、差し込む値があれば印を持つ文に値を入れ、無ければ印の無い文を出す。
 */
function shownWrittenLine(
  state: SessionState,
  reaction: WrittenReactionKind,
  values: ReactionValues,
): UntimedReaction {
  const { writtenReactions } = state
  if (writtenReactions.kind !== "written") {
    return NO_SHOWN_REACTION
  }
  const { reactions } = writtenReactions
  if (reaction === "failed") {
    return { kind: "shown", reaction, line: reactions.failed }
  }
  const written = reactions[reaction]
  const value = markValue(state, reaction, values)
  return {
    kind: "shown",
    reaction,
    line: {
      text:
        value.kind === "none"
          ? written.withoutMark
          : written.withMark.replace(REACTION_MARKS[reaction], () => value.text),
      expression: written.expression,
    },
  }
}

/** 印へ差し込む値。取れなければ `none`（印の無い文を出す）。 */
type MarkValue = { readonly kind: "none" } | { readonly kind: "value"; readonly text: string }

const NO_MARK_VALUE = { kind: "none" } as const satisfies MarkValue

function markValue(
  state: SessionState,
  reaction: MarkedReactionKind,
  { head, now, resetTimeText }: ReactionValues,
): MarkValue {
  switch (reaction) {
    case "retrying":
      return state.apiTrouble.kind === "retrying"
        ? { kind: "value", text: String(state.apiTrouble.attempt) }
        : NO_MARK_VALUE
    case "limited":
      return state.rateLimit.kind === "rejected" &&
        state.rateLimit.resetsAt !== undefined &&
        resetTimeText !== undefined
        ? { kind: "value", text: resetTimeText(state.rateLimit.resetsAt, now) }
        : NO_MARK_VALUE
    case "idle":
      return head.kind === "card" ? { kind: "value", text: head.name } : NO_MARK_VALUE
  }
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

function reactionKindOf(
  state: SessionState,
  now: number,
): ReactionKind | "accepted" | "welcome-back" | "none" {
  if (state.apiTrouble.kind === "retrying") {
    return "retrying"
  }
  switch (conversationMoment(state)) {
    case "greet":
      return isGreeting(state) ? "welcome" : "none"
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

/** 迎える局面で、吹き出しが迎えの挨拶を出す姿か（ほかの反応にも `speak` にも譲っていない）。 */
function isGreeting(state: SessionState): boolean {
  return (
    !state.chatMode &&
    state.character !== undefined &&
    state.apiTrouble.kind !== "retrying" &&
    conversationMoment(state) === "greet" &&
    state.speeches.length === 0
  )
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
