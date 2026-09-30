// メインビュー本体。レポートだけを出し、そこに質問の記録が挟まる（ツールの実行は描かない。作業の進行はサイドバーが別に持つ）。
//
// 1ターン＝1枚の札。直近 `MAX_MAIN_VIEW_TURNS` 件を札の頭の `‹` `›` で行き来する。
// 選んでいるターン（`turnId`）は `useTurnSelection` から読む（キャラビューの吹き出しも同じ選択に従うため、領域のローカル状態にしない）。
//
// レポートに書かれたパスを押せる部品にする一覧・依頼は `<RepositoryFileLinkProvider>` が配る。
// メインビューの中でしか描かないので、ここで1回だけ mount する。

import type { ReactElement } from "react"

import { useMainViewTurns } from "../../../../../stores/main-view-turn.ts"
import { useTurnSelection } from "../../../../../stores/turn-selection.ts"
import { Text } from "../../../../ui/text/text.tsx"
import { CurrentWorkCapsule } from "./components/current-work-capsule/current-work-capsule.tsx"
import { MiniPortrait } from "./components/mini-portrait/mini-portrait.tsx"
import { QuestionAsk } from "./components/question-ask/question-ask.tsx"
import { ReportOutline } from "./components/report-outline/report-outline.tsx"
import { TurnHeader } from "./components/turn-header/turn-header.tsx"
import { Turn } from "./components/turn/turn.tsx"
import { turnHistoryText, turnRequestRest, turnTitle } from "./domain/turn-title.ts"
import { useActiveTurnScroll } from "./hooks/use-active-turn-scroll.ts"
import styles from "./main-view.module.css"
import { RepositoryFileLinkProvider } from "./markdown/repository-link.tsx"

const EMPTY_MESSAGE = "（まだ作業がありません）"

export function MainView(): ReactElement {
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  // 畳んだ結果は姿ごとに1回だけ作られる（昇順。追従を決める `useTurnSelection` と同じものを読む）。
  const turns = useMainViewTurns()
  const scrollerRef = useActiveTurnScroll(activeTurnId)

  if (turns.length === 0) {
    return (
      <RepositoryFileLinkProvider>
        <Text
          element="p"
          size="inherit"
          tone="ink-quiet"
          weight="inherit"
          className={styles["placeholder"]}
        >
          {EMPTY_MESSAGE}
        </Text>
        <QuestionAsk />
        <CurrentWorkCapsule />
      </RepositoryFileLinkProvider>
    )
  }

  const activeIndex = turns.findIndex((turn) => turn.id === activeTurnId)
  const activeTurn = turns[activeIndex]

  return (
    <RepositoryFileLinkProvider>
      {/* `data-brush-origin`: ミニ立ち絵を置く座標の原点。
          印の名前は `BRUSH_ORIGIN_ATTRIBUTE` と揃える（JSX の属性名に定数を書けないので直に置き、ずれていないことはテストが見る）。 */}
      <div className={styles["main-turns"]} ref={scrollerRef} data-brush-origin="">
        {/* `key` にターンの番号を渡す。
            前後へ移っても同じ位置の `<Turn>` を使い回すと、「このターンを出し始めた時点で既にあった本文」（演出の対象を決める材料）が最初のターンのものに留まってしまう。 */}
        {activeTurn !== undefined && (
          <article className={styles["turn-card"]}>
            <TurnHeader
              turns={turns.map((turn) => ({
                id: turn.id,
                title: turnTitle(turn),
                requestRest: turnRequestRest(turn),
                historyText: turnHistoryText(turn),
              }))}
              activeTurnId={activeTurn.id}
              onSelect={selectTurn}
            />
            <ReportOutline positionLabel={`${String(activeIndex + 1)} / ${String(turns.length)}`}>
              <Turn turn={activeTurn} newest={activeTurn.id === newestTurnId} key={activeTurn.id} />
            </ReportOutline>
          </article>
        )}
        {/* 筆先に添うミニ立ち絵。この入れ物の原点を基準に置く（`position: absolute`）ので、書き上げたあと残っているあいだも本文と一緒に転がる。
            出ているやり取りを渡すのは、残った筆先が別のやり取りのものなら引っ込ませるため。 */}
        {activeTurn !== undefined && <MiniPortrait shownTurnId={activeTurn.id} />}
        {/* 答え待ちの質問の札。いまのやり取りのレポートの下に出す（読み終わった先に質問が来る並び）。
            答え待ちが無ければ何も描かない。 */}
        <QuestionAsk />
        {/* 動いている間だけ、領域の下端に浮かぶいまの作業の札。末尾に置いて、本文が短くても下端に来るようにする。 */}
        <CurrentWorkCapsule />
      </div>
    </RepositoryFileLinkProvider>
  )
}
