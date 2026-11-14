// イベント1件を畳む入口。サーバとブラウザの両方がこれを回す。
// `advanceSessionState` で姿を進め、その出来事で吹き出しが文の反応を新しく出し始めたなら、その行を記録（`reaction`）に積む。
//
// 前と後の姿を `shownReaction` で比べるので、比べるのは反応を出し始めうる出来事だけにする。
// 迎えの挨拶は札の名前を画面が差し込むので、ここでは積まず、画面が表示した文（`welcome-greeting-shown`）で積む。
// 挨拶の記録は挨拶1つにつき1件で、文が札で変わったら文と表情だけを差し替える（時刻は最初に積んだときのまま）。
// 挨拶を出している間の記録には依頼が無く、`/clear` と起こし直しで空になるので、そこにある `welcome` の反応の記録はいまの挨拶のものだけ
// （続きから起こした直後のおかえりは、組み直した依頼のあとにしか積まれない）。

import type { ReactionLine } from "../recommendation/reaction.ts"
import { isWelcomeGreetingLine, NO_WELCOME_HEAD } from "../recommendation/welcome-greeting.ts"
import { advanceSessionState } from "./session-advance.ts"
import type { SessionEvent } from "./session-event.ts"
import type { RecordTime, SessionRecord } from "./session-record.ts"
import type { SessionState } from "./session-state.ts"
import { greetingOnShow, shownReaction, type ShownReaction } from "./shown-reaction.ts"

/** 吹き出しが文の反応を出し始めうる出来事。 */
const REACTION_START_EVENT_KINDS: ReadonlySet<SessionEvent["kind"]> = new Set([
  "welcome-greeting-changed",
  "reactions-written",
  "character-changed",
  "api-retry",
  "turn-finished",
  "session-ended",
  "background-tasks-changed",
  "rate-limit-changed",
  "waiting-line-due",
] satisfies SessionEvent["kind"][])

/**
 * イベント1件を畳み込んで次の姿を返す（{@link advanceSessionState}）。
 * 文の反応を出し始めた出来事なら、その行を `at` の時刻で記録に1件積む。
 */
export function applySessionEvent(
  state: SessionState,
  event: SessionEvent,
  at: number,
): SessionState {
  const next = advanceSessionState(state, event, at)
  if (event.kind === "welcome-greeting-shown") {
    return recordWelcomeGreeting(next, event.line, at)
  }
  if (!REACTION_START_EVENT_KINDS.has(event.kind)) {
    return next
  }
  const shown = shownReaction(next, NO_WELCOME_HEAD, at)
  if (
    shown.kind !== "shown" ||
    greetingOnShow(next).kind === "shown" ||
    isAlreadyShown(state, next, shown, at)
  ) {
    return next
  }
  return {
    ...next,
    records: [
      ...next.records,
      {
        kind: "reaction",
        reaction: shown.reaction,
        text: shown.line.text,
        expression: shown.line.expression,
        time: recordedTime(shown, at),
      },
    ],
  }
}

/**
 * 画面が表示した迎えの挨拶の1行が、もう記録の文と同じか。
 * 同じなら `welcome-greeting-shown` を流しても記録は変わらない。
 */
export function isWelcomeGreetingRecorded(state: SessionState, line: ReactionLine): boolean {
  const recorded = state.records.find(isWelcomeReactionRecord)
  return (
    recorded !== undefined && recorded.text === line.text && recorded.expression === line.expression
  )
}

/**
 * 表示した迎えの挨拶の1行を記録に積む。挨拶の記録が無ければ `at` の時刻で1件積み、あれば文と表情だけを差し替える。
 * 迎えの挨拶を出していない姿（依頼のあとに遅れて届いた等）と、いまの挨拶から組めない文では何もしない。
 */
function recordWelcomeGreeting(state: SessionState, line: ReactionLine, at: number): SessionState {
  const onShow = greetingOnShow(state)
  if (
    onShow.kind !== "shown" ||
    !isWelcomeGreetingLine(onShow.greeting, line) ||
    isWelcomeGreetingRecorded(state, line)
  ) {
    return state
  }
  const index = state.records.findIndex(isWelcomeReactionRecord)
  if (index < 0) {
    return {
      ...state,
      records: [
        ...state.records,
        {
          kind: "reaction",
          reaction: "welcome",
          text: line.text,
          expression: line.expression,
          time: { kind: "stamped", at },
        },
      ],
    }
  }
  return {
    ...state,
    records: state.records.map((record, position) =>
      position === index && record.kind === "reaction"
        ? { ...record, text: line.text, expression: line.expression }
        : record,
    ),
  }
}

function isWelcomeReactionRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "reaction" }> {
  return record.kind === "reaction" && record.reaction === "welcome"
}

/**
 * 記録に残す、出し始めた時刻。ふだんは出来事の時刻 `at`。
 * 待ちの一言だけは出す時刻（`waitingLineDueAt`）にする。
 * ブラウザは `waiting-line-due` が届く前から自分の時計で出す時刻に出すので、記録が届く前と後で吹き出しの時刻が変わらないようにする。
 */
function recordedTime(
  shown: Extract<ShownReaction, { readonly kind: "shown" }>,
  at: number,
): RecordTime {
  return shown.reaction === "idle" ? shown.time : { kind: "stamped", at }
}

/**
 * その行をもう出しているか。
 * 待ちの一言は、ターンが閉じてから待ちの記録を積んだか（依頼を待つたびに1件）。
 * ほかは、前の姿でも同じ反応の同じ文を出していたか（続けて届く再試行を1件に畳む）。
 */
function isAlreadyShown(
  before: SessionState,
  after: SessionState,
  shown: Extract<ShownReaction, { readonly kind: "shown" }>,
  at: number,
): boolean {
  if (shown.reaction === "idle") {
    const { turn } = after
    return (
      turn.kind === "finished" &&
      after.records.some(
        (record) =>
          record.kind === "reaction" &&
          record.reaction === "idle" &&
          record.time.kind === "stamped" &&
          record.time.at >= turn.finishedAt,
      )
    )
  }
  const previous = shownReaction(before, NO_WELCOME_HEAD, at)
  return (
    previous.kind === "shown" &&
    previous.reaction === shown.reaction &&
    previous.line.text === shown.line.text
  )
}
