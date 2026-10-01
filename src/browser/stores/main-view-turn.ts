// メインビューに出すターン（`mainViewTurns` の導出）を、姿1つにつき1回だけ畳む場所。
//
// 畳みは5パスで、記録は最大20ターン分ある。
// 同じ導出を選んでいるターンの追従とメインビューの中身の2箇所が読むので、ここで1回だけ計算する。
//
// `useSession` のセレクタは同じ姿なら同じものを返す必要があるので、姿そのものをキーにして結果を覚える（`WeakMap` なので、古い姿と一緒に落ちる）。

import { replaceEqualDeep } from "@tanstack/react-query"

import {
  mainViewEntries,
  mainViewTurns,
  type MainViewTurn,
} from "../../shared/session/main-view.ts"
import type { SessionState, TurnBodies } from "../../shared/session/session-state.ts"
import { useSession } from "./session.ts"

const TURNS_BY_STATE = new WeakMap<SessionState, readonly MainViewTurn[]>()

let latestTurns: readonly MainViewTurn[] = []

/** メインビューに出すターン（昇順。末尾が今回）。 */
export function useMainViewTurns(): readonly MainViewTurn[] {
  return useSession((session) => mainViewTurnsOf(session.state))
}

/**
 * 姿1つから畳んだターン。2回目からは覚えたものを返すので、セレクタの中から呼んでよい。
 * 直前に畳んだ結果と中身の等しいターン・ステップは、直前の結果のものをそのまま返す。
 */
export function mainViewTurnsOf(state: SessionState): readonly MainViewTurn[] {
  const remembered = TURNS_BY_STATE.get(state)
  if (remembered !== undefined) {
    return remembered
  }
  const turns = replaceEqualDeep(
    latestTurns,
    mainViewTurns(mainViewEntries(state), unsettledBodies(state), isClosed(state)),
  )
  TURNS_BY_STATE.set(state, turns)
  latestTurns = turns
  return turns
}

/**
 * いちばん新しいやり取りでまだ伸びうる本文の種類（`mainViewTurns` の2つめの引数）。
 *
 * 伸びうるのは、いま走っている SDK ターンで届いた本文だけ（`SessionState.bodiesInTurn`）。
 * サブエージェントの `SendMessage` や背景のタスクの通知で claude が自分で続きのターンを始めると `running` に戻る。
 * そこで前の SDK ターンで確定した `report` まで伏せると、合図が届くたびに出ていた中間レポートが消えて、ターンが終わると同じものが出直す（画面で出た）。
 *
 * ターンが `running` かどうかだけでは足りない。
 * 背景の仕事（サブエージェント・背景のコマンド）を待って黙ると SDK が `result` を出すので `turn-finished` が届き、`finished` に落ちる。
 * 通知で再開したぶんは新しい依頼ではないので二度と立たず、そこから伸びる本文が「確定済み」として1文字目から出てしまう。
 * 書き上げる演出はマウントした時点の DOM しか相手にしないので、筆は数十文字ぶんで終わり、残りは隠されないまま流れ込み、ミニ立ち絵が本文の途中に立ったまま残る（画面で出た）。
 *
 * 書きかけがあるあいだ（`partialUtterance` が空でない）は伸びる途中とみなす。
 *
 * `report` の外の本文だけは、前の SDK ターンのものも伏せる。
 * ターンが動いているあいだと、背景のタスクが残っているあいだ（続きのターンが来うる）は出さない。
 * `report` の無いやり取りで出るのは `report` を呼ぶまでのつなぎの一言が多く、`report` が来た時点でどのみち消える（`selectToolReports`）ので、出したものが消える往復も起きない。
 */
function unsettledBodies(state: SessionState): TurnBodies {
  const running = state.turn.kind === "running"
  return {
    report: running && state.bodiesInTurn.report,
    utterance: running || state.backgroundTasks.length > 0 || state.partialUtterance !== "",
  }
}

/**
 * セッション全体が閉じているか（`mainViewTurns` の `closed` 引数）。
 * ターンが `running` でなく、背景のタスクも残っていないときだけ true。
 * どちらかが残っているあいだは、次の合図で続きのターンが始まり、いま最後の `report` が中間レポートへ回るかもしれない。
 *
 * `unsettledBodies` と役目が違う。
 * 背景のタスクを待って `turn-finished` が届くと、`unsettledBodies` の `report` は確定扱いに変わり本文は出る。
 * それでも背景のタスクが残っているあいだはこの関数は false のままで、最終レポートの札（ラベル・地の段上げ）だけを `markFinalReport` に立てさせない。
 */
function isClosed(state: SessionState): boolean {
  return state.turn.kind !== "running" && state.backgroundTasks.length === 0
}
