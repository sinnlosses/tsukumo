// ターンの始まり・続き・終わりが、進み具合と SDK ターンごとの持ち物（`SessionState` の `turn` など）をどう変えるか。

import type { A2uiWrittenComponent } from "../report/a2ui-report-catalog.ts"
import type { TurnEnding } from "../session-driver/turn-failure.ts"
import type { SessionState } from "./session-state.ts"
import {
  INITIAL_SPEECH_EXPRESSION,
  NOT_DRAFTING,
  OPENED_SDK_TURN,
  reportDraftingOf,
  writtenDraftComponentsOf,
  type OpenSdkTurn,
  type TurnProgress,
} from "./turn-progress.ts"

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

/** 失敗で終わったなら、理由を記録の末尾に積む（`SessionRecord` の `turn-failure`）。 */
export function recordTurnFailure(state: SessionState, ending: TurnEnding): SessionState {
  return ending.kind === "failed"
    ? { ...state, records: [...state.records, { kind: "turn-failure", failure: ending.failure }] }
    : state
}

/**
 * `SessionState.finishedTurnCount` を進める。
 * 進んでいるターンが終わったときだけ1つ増やす（始まっていないターンと、終わったあとにもう一度届いた終わりでは増やさない）。
 */
export function finishedTurnCountOf(state: SessionState): number {
  return state.turn.kind === "running" ? state.finishedTurnCount + 1 : state.finishedTurnCount
}

/** 書いていた `report` の呼び出しが届いた・終わったなら、書いている途中の印を下ろす。 */
export function settleReportDrafting(state: SessionState, toolUseId: string): SessionState {
  const drafting = reportDraftingOf(state.sdkTurn)
  return drafting.kind !== "idle" && drafting.toolUseId === toolUseId
    ? withOpenSdkTurn(state, (open) => ({ ...open, reportDrafting: NOT_DRAFTING }))
    : state
}

/** `report` の引数を書き始める。保留があれば、その部品を土台に持つ。 */
export function startReportDrafting(state: SessionState, toolUseId: string): SessionState {
  return withOpenSdkTurn(state, (open) => ({
    ...open,
    reportDrafting: {
      kind: "drafting",
      toolUseId,
      components: [],
      held: writtenDraftComponentsOf(open.reportDrafting),
    },
  }))
}

/** 書いている途中の呼び出しに部品を足す。同じ呼び出しの中で同じ `id` が再び届いても、最初のものを残す。 */
export function addDraftComponent(
  state: SessionState,
  toolUseId: string,
  component: A2uiWrittenComponent,
): SessionState {
  return withOpenSdkTurn(state, (open) => {
    const drafting = open.reportDrafting
    return drafting.kind === "drafting" &&
      drafting.toolUseId === toolUseId &&
      !drafting.components.some(({ id }) => id === component.id)
      ? {
          ...open,
          reportDrafting: { ...drafting, components: [...drafting.components, component] },
        }
      : open
  })
}

/** 書いていた `report` が差し戻されたなら、草稿を消さずに保留へ移す。 */
export function holdReportDrafting(state: SessionState, toolUseId: string): SessionState {
  const drafting = reportDraftingOf(state.sdkTurn)
  return drafting.kind === "drafting" && drafting.toolUseId === toolUseId
    ? withOpenSdkTurn(state, (open) => ({
        ...open,
        reportDrafting: { kind: "held", toolUseId, components: writtenDraftComponentsOf(drafting) },
      }))
    : state
}

/** 開いている SDK のターンだけを書き換える。閉じていれば姿をそのまま返す。 */
export function withOpenSdkTurn(
  state: SessionState,
  update: (open: OpenSdkTurn) => OpenSdkTurn,
): SessionState {
  return state.sdkTurn.kind === "open" ? { ...state, sdkTurn: update(state.sdkTurn) } : state
}

/** 続きのターンが引き継ぐ始まりの時刻。まだ一度もターンが無ければ `at`。 */
function runningStartedAt(turn: TurnProgress, at: number): number {
  return turn.kind === "idle" ? at : turn.startedAt
}
