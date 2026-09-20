// メインビュー本体（`<MainView>`。docs/design.md 6.1）。**レポートだけを出す**。そこに
// 質問の記録が挟まる（`docs/requirements.md` 4.2。ツールの実行は描かない。
// 作業の**進行**はサイドバーが別に持つ）。
//
// **1ターン＝1枚、直近 `MAX_MAIN_VIEW_TURNS` 件をタブにする。新しいターンで先頭へ戻すが、
// 利用者が過去のタブを見ている間は動かさない**（規則は `src/browser/stores/turn-selection.tsx` にある。
// docs/design.md 6.2）。
//
// 選んでいるターン（`turnId`）は `<TurnSelectionProvider>` の Context
// （キャラビューの吹き出しも同じ選択に従うため、領域のローカル状態にしない）。ここに残るのは
// **タブが切り替わったときにレポートの先頭へスクロールを戻す**配線だけ。

import { useEffect, useRef, type ReactElement } from "react"

import { mainViewEntries, mainViewTurns } from "../../../shared/main-view.ts"
import { useSession } from "../../stores/session.tsx"
import { useTurnSelection } from "../../stores/turn-selection.tsx"
import styles from "./main-view.module.css"
import { TurnTabs } from "./turn-tabs.tsx"
import { Turn } from "./turn.tsx"

const EMPTY_MESSAGE = "（まだ作業がありません）"

export function MainView(): ReactElement {
  const { state } = useSession()
  const { activeTurnId, selectTurn } = useTurnSelection()
  const entries = mainViewEntries(state)
  // mainViewTurns は昇順（古い→新しい）を返す。タブは新しい順に並べるので反転する。
  const turnsNewestFirst = [...mainViewTurns(entries, state.turnInProgress)].reverse()
  const turnIds = turnsNewestFirst.map((turn) => turn.id)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // 見ているターンが変わったら（自分でタブを選んだ・新しいターンに連れていかれた・選んでいた
  // ターンが窓から外れた）、そのターンのレポートの先頭から読ませる。
  useEffect(() => {
    const scroller = scrollerRef.current
    // 出ているターンが無い（下で placeholder を返す）ときは、戻す先そのものが無い。
    if (scroller === null || activeTurnId === undefined) {
      return
    }
    scroller.scrollTop = 0
  }, [activeTurnId])

  if (turnsNewestFirst.length === 0) {
    return <p className={styles["placeholder"]}>{EMPTY_MESSAGE}</p>
  }

  const activeTurn = turnsNewestFirst.find((turn) => turn.id === activeTurnId)

  return (
    <div className={styles["main-turns"]} ref={scrollerRef}>
      <TurnTabs turnIds={turnIds} activeTurnId={activeTurnId} onSelect={selectTurn} />
      {activeTurn !== undefined && <Turn turn={activeTurn} />}
    </div>
  )
}
