// メインビューに出すターン（`shared/main-view.ts` の導出）を、**姿1つにつき1回だけ**畳む場所。
//
// 畳みは `groupIntoTurns` → `selectLastText` / `selectToolReports` → `markSupersededSteps` → `markFinalReport` →
// `limitTurnEntries` の5パスで、記録は最大20ターン分ある。**同じ導出を読むのは `stores/turn-selection.tsx`（選んで
// いるターンの追従）と `components/page/conversation/components/main-view/`（中身）の2箇所**で、以前はそれぞれが毎フレーム
// 別々に計算していた（1本化した）。
//
// `useSyncExternalStore` のセレクタは**同じ姿なら同じものを返す**必要があるので、姿そのものを
// キーにして結果を覚える（`WeakMap` なので、古い姿と一緒に落ちる）。

import { mainViewEntries, mainViewTurns, type MainViewTurn } from "../../shared/main-view.ts"
import { type SessionState, type TurnBodies } from "../../shared/session-state.ts"
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
  const turns = mainViewTurns(mainViewEntries(state), unsettledBodies(state))
  TURNS_BY_STATE.set(state, turns)
  return turns
}

/**
 * いちばん新しいやり取りで**まだ伸びうる本文の種類**（`mainViewTurns` の2つめの引数）。
 *
 * **伸びうるのは、いま走っている SDK ターンで届いた本文だけ**（`SessionState.bodiesInTurn`）。
 * サブエージェントの `SendMessage` や背景のタスクの通知で claude が自分で続きのターンを始めると
 * `running` に戻るが、前の SDK ターンで確定した `report` まで伏せると、合図が届くたびに
 * 出ていた中間レポートが消えて、ターンが終わると同じものが出直す（画面で出た）。
 *
 * **ターンが `running` かどうかだけでは足りない。** 背景の仕事（サブエージェント・背景の
 * コマンド）を待って黙ると SDK が `result` を出すので `turn-finished` が届き、`finished` に落ちる。
 * 通知で再開したぶんは**新しい依頼ではない**ので二度と立たず、そこから伸びる本文が「確定済み」
 * として1文字目から出てしまう。**書き上げる演出はマウントした時点の DOM しか相手にしない**
 * （`domain/reveal/use-report-reveal.ts`）ので、筆は数十文字ぶんで終わり、残りは
 * 隠されないまま流れ込み、筆先に添うミニ立ち絵が本文の途中に立ったまま残る（画面で出た）。
 *
 * 書きかけがあるあいだ（`partialUtterance` が空でない）は伸びる途中とみなす。
 *
 * **`report` の外の本文だけは、前の SDK ターンのものも伏せる。** ターンが動いているあいだと、
 * 背景のタスクが残っているあいだ（続きのターンが来うる）は出さない。`report` の無いやり取りで
 * 出るのは `report` を呼ぶまでのつなぎの一言が多く、`report` が来た時点でどのみち消える
 * （`shared/main-view.ts` の `selectToolReports`）ので、出したものが消える往復も起きない。
 */
function unsettledBodies(state: SessionState): TurnBodies {
  const running = state.turn.kind === "running"
  return {
    report: running && state.bodiesInTurn.report,
    utterance: running || state.backgroundTasks.length > 0 || state.partialUtterance !== "",
  }
}
