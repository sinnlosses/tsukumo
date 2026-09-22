// メインビューに出すターン（`shared/main-view.ts` の導出）を、**姿1つにつき1回だけ**畳む場所。
//
// 畳みは `groupIntoTurns` → `selectShownReports` → `markSupersededSteps` → `markFinalReport` →
// `limitTurnEntries` の5パスで、記録は最大20ターン分ある。**同じ導出を読むのは `stores/turn-selection.tsx`（選んで
// いるターンの追従）と `features/main-view/`（中身）の2箇所**で、以前はそれぞれが毎フレーム
// 別々に計算していた（1本化した）。
//
// `useSyncExternalStore` のセレクタは**同じ姿なら同じものを返す**必要があるので、姿そのものを
// キーにして結果を覚える（`WeakMap` なので、古い姿と一緒に落ちる）。

import { mainViewEntries, mainViewTurns, type MainViewTurn } from "../../shared/main-view.ts"
import { type SessionState } from "../../shared/session-state.ts"
import { useSessionSelector } from "./session.tsx"

const TURNS_BY_STATE = new WeakMap<SessionState, readonly MainViewTurn[]>()

/** メインビューに出すターン（昇順。末尾が今回）。 */
export function useMainViewTurns(): readonly MainViewTurn[] {
  return useSessionSelector((session) => mainViewTurnsOf(session.state))
}

/** 姿1つから畳んだターン。**2回目からは覚えたものを返す**ので、セレクタの中から呼んでよい。 */
export function mainViewTurnsOf(state: SessionState): readonly MainViewTurn[] {
  const remembered = TURNS_BY_STATE.get(state)
  if (remembered !== undefined) {
    return remembered
  }
  const turns = mainViewTurns(mainViewEntries(state), state.turnInProgress)
  TURNS_BY_STATE.set(state, turns)
  return turns
}
