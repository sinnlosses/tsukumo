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

import { useMainViewTurns } from "../../stores/main-view-turn.ts"
import { useTurnSelection } from "../../stores/turn-selection.tsx"
import styles from "./main-view.module.css"
import { MiniPortrait } from "./mini-portrait.tsx"
import { PendingQuestion } from "./pending-question.tsx"
import { TurnTabs } from "./turn-tabs.tsx"
import { Turn } from "./turn.tsx"

const EMPTY_MESSAGE = "（まだ作業がありません）"

export function MainView(): ReactElement {
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  // 畳んだ結果は `stores/main-view-turn.ts` が姿ごとに1回だけ作る（昇順。タブの追従を決める
  // `stores/turn-selection.tsx` と同じものを読む）。タブは新しい順に並べるので反転する。
  const turns = useMainViewTurns()
  const turnsNewestFirst = [...turns].reverse()
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
    // `scrollTop` ではなく `scrollIntoView`: 実際に転がる祖先が画面幅で入れ替わる
    // （広い画面は `section[data-region="main"]`、狭い画面（≤760px）はページ自身）。
    // `scrollIntoView` は「どの祖先が転がっているか」を呼ぶ側が知らなくても、転がる祖先を
    // 全部たどって動かす。
    scroller.scrollIntoView({ block: "start" })
  }, [activeTurnId])

  if (turnsNewestFirst.length === 0) {
    return (
      <>
        <PendingQuestion />
        <p className={styles["placeholder"]}>{EMPTY_MESSAGE}</p>
      </>
    )
  }

  const activeTurn = turnsNewestFirst.find((turn) => turn.id === activeTurnId)

  return (
    <div className={styles["main-turns"]} ref={scrollerRef}>
      {/* 答え待ちの質問の比較。**タブより上**に出す（聞かれている間はそれが最優先で読むもの
          だから）。`preview` が1つも無い質問では何も描かない。 */}
      <PendingQuestion />
      <TurnTabs turnIds={turnIds} activeTurnId={activeTurnId} onSelect={selectTurn} />
      {/* **`key` にやり取りの番号を渡す。** タブを切り替えても同じ位置の `<Turn>` を使い回すと、
          「このやり取りを出し始めた時点で既にあった本文」（演出の対象を決める材料。`turn.tsx`）が
          最初のやり取りのものに留まってしまう。 */}
      {activeTurn !== undefined && (
        <Turn turn={activeTurn} newest={activeTurn.id === newestTurnId} key={activeTurn.id} />
      )}
      {/* 筆先に添うミニ立ち絵。**ビューポート基準に置く**（`position: fixed`）ので、ここは
          「レポートを出す場所と一緒に現れて消える」ことだけを決めている。 */}
      <MiniPortrait />
    </div>
  )
}
