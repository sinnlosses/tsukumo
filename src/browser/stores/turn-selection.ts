// いま見ているターン。メインビューの札で選んだターンがキャラビューの吹き出し・表情にも効くので、画面全体で共有する。
//
// 正典は `location.hash` の `turn`（書き方は `writeHashRoute`）で、自分では状態を持たない。
// リロードしても同じターンを開いたまま戻り、ブラウザの「戻る」で1つ前に見ていたターンへ移る。
//
// 規則: hash に `turn` が無ければ今回に追従する（新しいターンが始まれば先頭へ移る）。
// 札の `‹` `›` で過去のターンを選ぶと hash にそのターンが乗り、新しいターンが来ても動かない。
// 最新のターンを選ぶ（`›` で端まで戻る・「最新へ」）と `turn` を外して追従に戻る。
// hash が指すターンが窓（`MAX_MAIN_VIEW_TURNS` 件）に無ければ今回を出す（hash は書き換えない。描くたびに外の状態を書くことになるため）。

import type { SessionState } from "../../shared/session/session-state.ts"
import { readHashRoute, useHashRoute, writeHashRoute } from "./location-hash.ts"
import { mainViewTurnsOf } from "./main-view-turn.ts"
import { useSession } from "./session.ts"

export type TurnSelectionValue = {
  /**
   * いま見ているターンの通し番号（`mainViewTurns` が振るもの）。
   * hash が指すターンが窓に無ければ今回に戻る。ターンが1つも無ければ undefined。
   */
  readonly activeTurnId: number | undefined
  /** 今回（いちばん新しい）のターンの通し番号。ターンが1つも無ければ undefined。 */
  readonly newestTurnId: number | undefined
  readonly selectTurn: (turnId: number) => void
}

export function useTurnSelection(): TurnSelectionValue {
  const newestTurnId = useSession((session) => newestTurnIdOf(session.state))
  const viewedTurn = useHashRoute((route) => route.turn)
  const viewedStillShown = useSession(
    (session) =>
      viewedTurn !== "newest" &&
      mainViewTurnsOf(session.state).some((turn) => turn.id === viewedTurn),
  )
  const activeTurnId = viewedTurn !== "newest" && viewedStillShown ? viewedTurn : newestTurnId
  return { activeTurnId, newestTurnId, selectTurn }
}

/** そのターンに留める。今回を選んだときは `turn` を外して追従に戻る。 */
function selectTurn(turnId: number): void {
  const newestTurnId = newestTurnIdOf(useSession.getState().state)
  writeHashRoute({
    ...readHashRoute(),
    turn: turnId === newestTurnId ? "newest" : turnId,
  })
}

/** 札で行き来できるターン（窓の中）は昇順なので、末尾が今回。 */
function newestTurnIdOf(state: SessionState): number | undefined {
  return mainViewTurnsOf(state).at(-1)?.id
}
