// ターンの始まり・続き・終わりが、進み具合と SDK ターンごとの持ち物（`SessionState` の `turn` など）をどう変えるか。

import type { Expression } from "../character-pack/expression.ts"
import type { ApiTrouble } from "../session-driver/api-trouble.ts"
import type {
  TurnEnding,
  TurnFailure,
  TurnFailureCause,
  TurnOutcome,
} from "../session-driver/turn-failure.ts"
import type { SessionState, TurnBodies, TurnProgress } from "./session-state.ts"

export const INITIAL_SPEECH_EXPRESSION = "default" as const satisfies Expression

export const NO_TURN_BODIES = { report: false, utterance: false } as const satisfies TurnBodies

/**
 * ターンの始まりを畳む（記録は動かさない）。`request` と「記録を持たないターンの始まり」
 * （`turn-started`）で共通の部分で、積むものがあるかどうかだけが違う。
 */
export function beginTurn(state: SessionState, at: number): SessionState {
  return {
    ...state,
    // 送信した時点で吹き出しを空にする。
    // 前のターンの一言が残ったままだと、次のターンに移ったことが画面から分からない。
    speeches: [],
    // 表情も既定へ戻す。次の `speak` が来るまではこのままで、ツールの実行状況では動かない。
    speechExpression: INITIAL_SPEECH_EXPRESSION,
    partialUtterance: "",
    reportDrafting: { kind: "idle" },
    turn: { kind: "running", startedAt: at },
    nextTurnId: state.nextTurnId + 1,
    speechCalledInTurn: false,
    bodiesInTurn: NO_TURN_BODIES,
    answeringAside: false,
    apiTrouble: { kind: "none" },
  }
}

/**
 * 脇の話（`aside`）で始まる SDK ターン。
 * 書きかけは空へ戻すが、吹き出しと表情は持ち越し、答えのセリフを後ろに足す。
 * 親のやり取りの続きなので、ターンの通し番号は進めず、始まった時刻は前のターンのものを引き継ぐ。
 */
export function beginAside(state: SessionState, at: number): SessionState {
  return {
    ...beginTurn(state, at),
    speeches: state.speeches,
    speechExpression: state.speechExpression,
    turn: { kind: "running", startedAt: runningStartedAt(state.turn, at) },
    nextTurnId: state.nextTurnId,
    answeringAside: true,
  }
}

/**
 * claude が自分で始めた続きのターン（`turn-resumed`）。
 * 進行中の印と SDK ターンごとの持ち物は {@link beginTurn} と同じに戻すが、吹き出しのセリフと表情は持ち越し、ターンの通し番号も進めない（同じやり取りの続き）。
 * 始まった時刻も付け直さない（入力欄の経過時間が、背景のタスクを挟んだ続きのターンでも依頼を送った時刻から数える）。
 */
export function resumeTurn(state: SessionState, at: number): SessionState {
  return {
    ...state,
    partialUtterance: "",
    reportDrafting: { kind: "idle" },
    turn: { kind: "running", startedAt: runningStartedAt(state.turn, at) },
    bodiesInTurn: NO_TURN_BODIES,
    answeringAside: false,
    apiTrouble: { kind: "none" },
  }
}

/**
 * ターンの終わり方を、失敗だったかどうかに畳む（中断は失敗にしない）。
 * 失敗の理由が API のエラーなら、そのターンで届いた種類を足す
 * （`assistant` の `error`（`errored`）、無ければ最後の呼び直しの知らせ（`retrying`。呼び直しを使い切って止まったとき）、どちらも無ければ `unknown`）。
 */
export function turnEnding(outcome: TurnOutcome, trouble: ApiTrouble): TurnEnding {
  return outcome.kind === "failed"
    ? { kind: "failed", failure: toTurnFailure(outcome.cause, trouble) }
    : { kind: "ended" }
}

/** 失敗で終わったなら、理由を記録の末尾に積む（`SessionRecord` の `turn-failure`）。 */
export function recordTurnFailure(state: SessionState, ending: TurnEnding): SessionState {
  return ending.kind === "failed"
    ? { ...state, records: [...state.records, { kind: "turn-failure", failure: ending.failure }] }
    : state
}

/**
 * ターンの終わりを畳む（`turn-finished` と `session-ended` で共通）。
 * 始まっていないターンは終われないので、まだ一度も依頼が無ければ `idle` のまま返す（依頼より先に `session-ended` が届く経路がある。そこでは立ち絵の「完了の反応」も出さない）。
 * 終わったあとにもう一度届いたときは、起点を動かさずに終わった時刻だけ進める。
 */
export function finishTurn(turn: TurnProgress, at: number, ending: TurnEnding): TurnProgress {
  if (turn.kind === "idle") {
    return turn
  }
  return { kind: "finished", startedAt: turn.startedAt, finishedAt: at, ending }
}

/**
 * {@link SessionState.finishedTurnCount} を進める。
 * 進んでいるターンが終わったときだけ1つ増やす（始まっていないターンと、終わったあとにもう一度届いた終わりでは増やさない）。
 */
export function finishedTurnCountOf(state: SessionState): number {
  return state.turn.kind === "running" ? state.finishedTurnCount + 1 : state.finishedTurnCount
}

/** 続きのターンが引き継ぐ始まりの時刻。まだ一度もターンが無ければ `at`。 */
function runningStartedAt(turn: TurnProgress, at: number): number {
  return turn.kind === "idle" ? at : turn.startedAt
}

function toTurnFailure(cause: TurnFailureCause, trouble: ApiTrouble): TurnFailure {
  if (cause.kind !== "api-error") {
    return cause
  }
  return { kind: "api-error", error: trouble.kind === "none" ? "unknown" : trouble.error }
}
