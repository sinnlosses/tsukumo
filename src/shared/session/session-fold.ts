// イベント1件を畳む入口。サーバとブラウザの両方がこれを回す。
// `advanceSessionState` で姿を進め、その出来事で吹き出しが文の反応を新しく出し始めたなら、その行を記録（`reaction`）に積む。
//
// 前と後の姿を `shownReaction` で比べるので、比べるのは反応を出し始めうる出来事だけにする。
// 迎えの挨拶の札は画面が決めるので、記録には札の無い文を積む。

import { NO_WELCOME_HEAD } from "../recommendation/welcome-greeting.ts"
import type { SessionEvent } from "./session-event.ts"
import { advanceSessionState, type RecordTime, type SessionState } from "./session-state.ts"
import { shownReaction, type ShownReaction } from "./shown-reaction.ts"

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
  if (!REACTION_START_EVENT_KINDS.has(event.kind)) {
    return next
  }
  const shown = shownReaction(next, NO_WELCOME_HEAD, at)
  if (shown.kind !== "shown" || isAlreadyShown(state, next, shown, at)) {
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
