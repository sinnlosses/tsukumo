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
  const turns = mainViewTurns(mainViewEntries(state), isTurnUnsettled(state))
  TURNS_BY_STATE.set(state, turns)
  return turns
}

/**
 * いちばん新しいやり取りの締めの本文が**まだ伸びうるか**（`mainViewTurns` の2つめの引数）。
 *
 * **ターンが `running` かどうかだけでは足りない。** 背景の仕事（サブエージェント・背景の
 * コマンド）を待って黙ると SDK が `result` を出すので `turn-finished` が届き、`finished` に落ちる。
 * 通知で再開したぶんは**新しい依頼ではない**ので二度と立たず、そこから伸びる本文が「確定済み」
 * として1文字目から出てしまう。**書き上げる演出はマウントした時点の DOM しか相手にしない**
 * （`features/main-view/reveal/use-report-reveal.ts`）ので、筆は数十文字ぶんで終わり、残りは
 * 隠されないまま流れ込み、筆先に添うミニ立ち絵が本文の途中に立ったまま残る（画面で出た）。
 *
 * 書きかけがあるあいだ（`partialUtterance` が空でない）は伸びる途中とみなす。
 */
function isTurnUnsettled(state: SessionState): boolean {
  return state.turn.kind === "running" || state.partialUtterance !== ""
}
