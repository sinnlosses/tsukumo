// メインビュー本体（`<MainView>`。docs/design.md 6.1）。**レポートだけを出す**。そこに
// 質問の記録が挟まる（`docs/requirements.md` 4.2。ツールの実行は描かない。
// 作業の**進行**はサイドバーが別に持つ）。
//
// **1ターン＝1枚の札。直近 `MAX_MAIN_VIEW_TURNS` 件を札の頭の `‹` `›` で行き来する**
// （`turn-header.tsx`）。新しいターンで最新へ移すが、利用者が過去のターンを見ている間は
// 動かさない（規則は `src/browser/stores/turn-selection.tsx` にある。docs/design.md 6.2）。
//
// 選んでいるターン（`turnId`）は `<TurnSelectionProvider>` の Context
// （キャラビューの吹き出しも同じ選択に従うため、領域のローカル状態にしない）。ここに残るのは
// **見ているターンが替わったときにレポートの先頭へスクロールを戻す**配線だけ。

import { useEffect, useRef, type ReactElement } from "react"

import { useMainViewTurns } from "../../stores/main-view-turn.ts"
import { useTurnSelection } from "../../stores/turn-selection.tsx"
import { turnTitle } from "./domain/turn-title.ts"
import styles from "./main-view.module.css"
import { MiniPortrait } from "./mini-portrait.tsx"
import { PendingQuestion } from "./pending-question.tsx"
import { TurnHeader } from "./turn-header.tsx"
import { Turn } from "./turn.tsx"

const EMPTY_MESSAGE = "（まだ作業がありません）"

export function MainView(): ReactElement {
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  // 畳んだ結果は `stores/main-view-turn.ts` が姿ごとに1回だけ作る（昇順。追従を決める
  // `stores/turn-selection.tsx` と同じものを読む）。
  const turns = useMainViewTurns()
  const scrollerRef = useRef<HTMLDivElement>(null)

  // 見ているターンが変わったら（自分で前後へ移った・新しいターンに連れていかれた・選んでいた
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

  if (turns.length === 0) {
    return (
      <>
        <PendingQuestion />
        <p className={styles["placeholder"]}>{EMPTY_MESSAGE}</p>
      </>
    )
  }

  const activeTurn = turns.find((turn) => turn.id === activeTurnId)

  return (
    // `data-brush-origin`: ミニ立ち絵を置く座標の原点（印の名前は `stores/brush-tip.ts` の
    // `BRUSH_ORIGIN_ATTRIBUTE`。JSX の属性名に定数を書けないので直に置き、ずれていないことは
    // テストが見る）。
    <div className={styles["main-turns"]} ref={scrollerRef} data-brush-origin="">
      {/* 答え待ちの質問の比較。**札より上**に出す（聞かれている間はそれが最優先で読むもの
          だから）。`preview` が1つも無い質問では何も描かない。 */}
      <PendingQuestion />
      {/* **`key` にターンの番号を渡す。** 前後へ移っても同じ位置の `<Turn>` を使い回すと、
          「このターンを出し始めた時点で既にあった本文」（演出の対象を決める材料。`turn.tsx`）が
          最初のターンのものに留まってしまう。 */}
      {activeTurn !== undefined && (
        <article className={styles["turn-card"]}>
          <TurnHeader
            turnIds={turns.map((turn) => turn.id)}
            activeTurnId={activeTurn.id}
            title={turnTitle(activeTurn)}
            onSelect={selectTurn}
          />
          <div className={styles["turn-body"]}>
            <Turn turn={activeTurn} newest={activeTurn.id === newestTurnId} key={activeTurn.id} />
          </div>
        </article>
      )}
      {/* 筆先に添うミニ立ち絵。**この入れ物の原点を基準に置く**（`position: absolute`）ので、
          書き上げたあと残っているあいだも本文と一緒に転がる。**出ているやり取りを渡す**のは、
          残った筆先が別のやり取りのものなら引っ込ませるため（`mini-portrait.tsx`）。 */}
      {activeTurn !== undefined && <MiniPortrait shownTurnId={activeTurn.id} />}
    </div>
  )
}
