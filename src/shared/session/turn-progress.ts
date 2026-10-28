// ターンの始まり・続き・終わりが、進み具合と SDK ターンごとの持ち物（`SessionState` の `turn` など）をどう変えるか。

import type { Expression } from "../character-pack/expression.ts"
import type { A2uiReportComponent } from "../report/a2ui-report-catalog.ts"
import type { ApiTrouble } from "../session-driver/api-trouble.ts"
import type {
  TurnEnding,
  TurnFailure,
  TurnFailureCause,
  TurnOutcome,
} from "../session-driver/turn-failure.ts"
import type { SessionState } from "./session-state.ts"

/**
 * ターンの進み具合。`request` で `running` になり、`turn-finished` / `session-ended` で `finished` になる（入力欄が送信と中断を切り替える判断材料）。
 *
 * - `idle`: まだ一度も依頼が無い
 * - `running`: 依頼を送って、まだ終わっていない。
 *   委譲した続きを claude が自分で始めたとき（`turn-resumed`）も `startedAt` は付け直さず、依頼を送った時刻のまま引き継ぐ（`resumeTurn`）
 * - `finished`: 終わった。`startedAt` は次の `request` まで持ち続ける（入力欄の経過時間表示が「所要」として出し続ける）。
 *   `ending` は失敗で終わったか（{@link TurnEnding}。入力欄の「失敗」の字と、立ち絵の「失敗でびくっ」の材料。`session-ended` で終わったときは `ended`）。
 *   ここが `finished` でも {@link SessionState.backgroundTasks} が残っていれば、入力欄は「経過」のまま数え続ける
 */
export type TurnProgress =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly startedAt: number }
  | {
      readonly kind: "finished"
      readonly startedAt: number
      readonly finishedAt: number
      readonly ending: TurnEnding
    }

/**
 * いま走っている SDK のターンで届いた本文の種類（{@link OpenSdkTurn} の `bodies`）。`report` は
 * `report` ツールの呼び出し、`utterance` はツールの外に書いた本文（空白だけのものは数えない）。
 */
export type TurnBodies = { readonly report: boolean; readonly utterance: boolean }

/**
 * メインが `report` の引数を書いている途中か（{@link OpenSdkTurn} の `reportDrafting`）。
 * `components` は引数の中で閉じた部品を届いた順に持つ（同じ `id` は最初のものだけ）。
 */
export type ReportDrafting =
  | { readonly kind: "idle" }
  | {
      readonly kind: "drafting"
      readonly toolUseId: string
      readonly components: readonly A2uiReportComponent[]
    }

/**
 * SDK のターンの持ち物（{@link SessionState.sdkTurn}）。開いている間だけ欄を持ち、閉じると型の上で消える。
 *
 * - `bodies`: このターンで届いた本文の種類。
 *   メインビューが「まだ伸びうる本文」を伏せるときに、前の SDK のターンで確定した本文まで巻き込まないために要る
 * - `answeringAside`: 脇の話（`aside`）で開いたか
 * - `reportDrafting`: メインが `report` の引数を書いている途中か。
 *   `report-drafting` で書き始め、同じ `toolUseId` の `report` か `tool-finished`（差し戻されて `report` が届かないときもこちらは届く）で終わる
 */
export type SdkTurn = { readonly kind: "closed" } | OpenSdkTurn

export type OpenSdkTurn = {
  readonly kind: "open"
  readonly bodies: TurnBodies
  readonly answeringAside: boolean
  readonly reportDrafting: ReportDrafting
}

export const INITIAL_SPEECH_EXPRESSION = "default" as const satisfies Expression

const NO_TURN_BODIES = { report: false, utterance: false } as const satisfies TurnBodies

export const CLOSED_SDK_TURN = { kind: "closed" } as const satisfies SdkTurn

const NOT_DRAFTING = { kind: "idle" } as const satisfies ReportDrafting

const OPENED_SDK_TURN = {
  kind: "open",
  bodies: NO_TURN_BODIES,
  answeringAside: false,
  reportDrafting: NOT_DRAFTING,
} as const satisfies SdkTurn

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
    turn: { kind: "running", startedAt: at },
    nextTurnId: state.nextTurnId + 1,
    speechCalledInTurn: false,
    sdkTurn: OPENED_SDK_TURN,
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
    sdkTurn: { ...OPENED_SDK_TURN, answeringAside: true },
  }
}

/**
 * claude が自分で始めた続きのターン（`turn-resumed`）。
 * 進行中の印と SDK ターンごとの持ち物は {@link beginTurn} と同じに戻すが、吹き出しのセリフと表情は持ち越し、ターンの通し番号も進めない（同じやり取りの続き）。
 * 始まった時刻も付け直さない（入力欄の経過時間が、バックグラウンドタスクを挟んだ続きのターンでも依頼を送った時刻から数える）。
 */
export function resumeTurn(state: SessionState, at: number): SessionState {
  return {
    ...state,
    partialUtterance: "",
    turn: { kind: "running", startedAt: runningStartedAt(state.turn, at) },
    sdkTurn: OPENED_SDK_TURN,
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

/** 書いていた `report` の呼び出しが届いた・終わったなら、書いている途中の印を下ろす。 */
export function settleReportDrafting(state: SessionState, toolUseId: string): SessionState {
  const drafting = reportDraftingOf(state.sdkTurn)
  return drafting.kind === "drafting" && drafting.toolUseId === toolUseId
    ? withOpenSdkTurn(state, (open) => ({ ...open, reportDrafting: NOT_DRAFTING }))
    : state
}

/** 開いている SDK のターンだけを書き換える。閉じていれば姿をそのまま返す。 */
export function withOpenSdkTurn(
  state: SessionState,
  update: (open: OpenSdkTurn) => OpenSdkTurn,
): SessionState {
  return state.sdkTurn.kind === "open" ? { ...state, sdkTurn: update(state.sdkTurn) } : state
}

/** `/clear` のあとの SDK のターン。開いていれば中身を空にして開いたまま、閉じていれば閉じたまま。 */
export function clearedSdkTurn(sdkTurn: SdkTurn): SdkTurn {
  return sdkTurn.kind === "open" ? OPENED_SDK_TURN : CLOSED_SDK_TURN
}

/** `report` の引数を書いている途中か。閉じていれば書いていない（毎回同じ値を返す）。 */
export function reportDraftingOf(sdkTurn: SdkTurn): ReportDrafting {
  return sdkTurn.kind === "open" ? sdkTurn.reportDrafting : NOT_DRAFTING
}

/** 脇の話で開いた SDK のターンの中か。 */
export function answeringAsideOf(sdkTurn: SdkTurn): boolean {
  return sdkTurn.kind === "open" && sdkTurn.answeringAside
}

/** いまの SDK のターンで届いた本文の種類。閉じていれば何も届いていない（毎回同じ値を返す）。 */
export function bodiesOf(sdkTurn: SdkTurn): TurnBodies {
  return sdkTurn.kind === "open" ? sdkTurn.bodies : NO_TURN_BODIES
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
