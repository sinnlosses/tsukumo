// メインビュー本体。いま出している中身（迎える口・作業の地図・レポート）を出し分ける。
//
// 1ターン＝1枚の札。直近 `MAX_MAIN_VIEW_TURNS` 件を札の頭の `‹` `›` で行き来する。
// 選んでいるターン（`turnId`）は `useTurnSelection` から読む（キャラビューの吹き出しも同じ選択に従うため、領域のローカル状態にしない）。
// 最新を見ているあいだの中身は `useMainViewContent` が決め、過去のターンを見ているあいだはそのターンのレポートを出す。
//
// レポートに書かれたパスを押せる部品にする一覧・依頼は `<RepositoryFileLinkProvider>` が配る。
// メインビューの中でしか描かないので、ここで1回だけ mount する。

import { useRef, type ReactElement } from "react"
import { useShallow } from "zustand/react/shallow"

import { conversationMoment } from "../../../../../../shared/session/conversation-moment.ts"
import type { MainViewTurn } from "../../../../../../shared/session/main-view.ts"
import type { SessionState } from "../../../../../../shared/session/session-state.ts"
import { currentPhaseOf, type WorkPhase } from "../../../../../../shared/session/work-plan.ts"
import { currentTurnStepsOf } from "../../../../../stores/current-turn-steps.ts"
import {
  type MainViewContent,
  useMainViewContent,
} from "../../../../../stores/main-view-content.ts"
import { useMainViewTurns } from "../../../../../stores/main-view-turn.ts"
import { useQuestionScroll } from "../../../../../stores/question-scroll.ts"
import { useSession } from "../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../stores/turn-selection.ts"
import { Text } from "../../../../ui/text/text.tsx"
import { CurrentWorkCapsule } from "./components/current-work-capsule/current-work-capsule.tsx"
import { MiniPortrait } from "./components/mini-portrait/mini-portrait.tsx"
import { QuestionAsk } from "./components/question-ask/question-ask.tsx"
import { ReportOutline } from "./components/report-outline/report-outline.tsx"
import { TurnHeader } from "./components/turn-header/turn-header.tsx"
import { Turn } from "./components/turn/turn.tsx"
import { headNoticeOf, type HeadNoticeAction } from "./domain/head-notice.ts"
import { turnHistoryText, turnRequestRest, turnTitle } from "./domain/turn-title.ts"
import { NO_SHOWN_KEY, useActiveTurnScroll } from "./hooks/use-active-turn-scroll.ts"
import { useMainViewHold } from "./hooks/use-main-view-hold.ts"
import styles from "./main-view.module.css"
import { RepositoryFileLinkProvider } from "./markdown/repository-link.tsx"

const EMPTY_MESSAGE = "（まだ作業がありません）"

/** 画面に出す中身。`card` は札に載せるターンで、`fresh` は地図から入れ替えたばかりのレポートか。 */
type ShownView =
  | { readonly kind: "welcome" }
  | { readonly kind: "work-map" | "report"; readonly card: ShownCard }

type ShownCard =
  | { readonly kind: "none" }
  | { readonly kind: "turn"; readonly turn: MainViewTurn; readonly fresh: boolean }

export function MainView(): ReactElement {
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  // 畳んだ結果は姿ごとに1回だけ作られる（昇順。追従を決める `useTurnSelection` と同じものを読む）。
  const turns = useMainViewTurns()
  const content = useMainViewContent((state) => state.content)
  const acceptHeldReport = useMainViewContent((state) => state.acceptHeldReport)
  const requestQuestionScroll = useQuestionScroll((state) => state.requestScroll)
  const moment = useSession((session) => conversationMoment(session.state))
  const phase = useSession(useShallow((session) => newestPhaseOf(session.state)))
  const rootRef = useRef<HTMLDivElement>(null)
  useMainViewHold(rootRef)

  const viewing: Viewing =
    activeTurnId !== undefined && activeTurnId !== newestTurnId
      ? { kind: "past", turnId: activeTurnId }
      : { kind: "newest" }
  const viewingPast = viewing.kind === "past"
  const view = shownView(content, turns, viewing)
  useActiveTurnScroll(rootRef, shownKeyOf(view))

  const notice = headNoticeOf({ content, moment, viewingPast, phase })

  function onNotice(action: HeadNoticeAction): void {
    if (action === "accept-report") {
      acceptHeldReport()
      return
    }
    if (newestTurnId !== undefined) {
      selectTurn(newestTurnId)
    }
    if (action === "to-question") {
      requestQuestionScroll()
    }
  }

  const cardTurn = view.kind !== "welcome" && view.card.kind === "turn" ? view.card : undefined

  return (
    <RepositoryFileLinkProvider>
      {/* `data-brush-origin`: ミニ立ち絵を置く座標の原点。
          印の名前は `BRUSH_ORIGIN_ATTRIBUTE` と揃える（JSX の属性名に定数を書けないので直に置く）。 */}
      <div className={styles["main-turns"]} ref={rootRef} data-brush-origin="">
        {/* 中身の種類が替わったときだけ作り直し、そのときだけ現れる動きが1回掛かる。 */}
        <div
          key={view.kind}
          className={styles["main-view-content"]}
          data-main-view-content={view.kind}
        >
          {view.kind === "welcome" && (
            <Text
              element="p"
              size="inherit"
              tone="ink-quiet"
              weight="inherit"
              className={styles["placeholder"]}
            >
              {EMPTY_MESSAGE}
            </Text>
          )}
          {cardTurn !== undefined && (
            <article className={styles["turn-card"]}>
              <TurnHeader
                turns={turns.map((turn) => ({
                  id: turn.id,
                  title: turnTitle(turn),
                  requestRest: turnRequestRest(turn),
                  historyText: turnHistoryText(turn),
                }))}
                activeTurnId={cardTurn.turn.id}
                onSelect={selectTurn}
                notice={notice}
                onNotice={onNotice}
              />
              <ReportOutline positionLabel={positionLabel(turns, cardTurn.turn.id)}>
                {/* `key` にターンの番号を渡す。
                    前後へ移っても同じ位置の `<Turn>` を使い回すと、「このターンを出し始めた時点で既にあった本文」（演出の対象を決める材料）が最初のターンのものに留まってしまう。 */}
                <Turn
                  turn={cardTurn.turn}
                  newest={cardTurn.turn.id === newestTurnId}
                  freshReport={cardTurn.fresh}
                  key={cardTurn.turn.id}
                />
              </ReportOutline>
            </article>
          )}
        </div>
        {/* 筆先に添うミニ立ち絵。この入れ物の原点を基準に置く（`position: absolute`）ので、書き上げたあと残っているあいだも本文と一緒に転がる。
            出ているやり取りを渡すのは、残った筆先が別のやり取りのものなら引っ込ませるため。 */}
        {cardTurn !== undefined && <MiniPortrait shownTurnId={cardTurn.turn.id} />}
        {/* 答え待ちの質問の札。いまのやり取りのレポートの下に出す（読み終わった先に質問が来る並び）。
            答え待ちが無ければ何も描かない。 */}
        <QuestionAsk />
        {/* 動いている間だけ、領域の下端に浮かぶいまの作業の札。末尾に置いて、本文が短くても下端に来るようにする。 */}
        <CurrentWorkCapsule />
      </div>
    </RepositoryFileLinkProvider>
  )
}

/** 見ているターン。過去のターンを見ているあいだは、そのターンのレポートを出す。 */
type Viewing = { readonly kind: "newest" } | { readonly kind: "past"; readonly turnId: number }

/** 出す中身を決める。保留して地図に残したあいだは、生きたターンではなく閉じる前に写したターンを出す。 */
function shownView(
  content: MainViewContent,
  turns: readonly MainViewTurn[],
  viewing: Viewing,
): ShownView {
  const newest = turns.at(-1)
  if (viewing.kind === "past") {
    const past = turns.find((turn) => turn.id === viewing.turnId)
    return {
      kind: "report",
      card: past === undefined ? NO_CARD : { kind: "turn", turn: past, fresh: false },
    }
  }
  switch (content.kind) {
    case "welcome":
      return content
    case "work-map":
      if (content.hold.kind === "held") {
        return { kind: "work-map", card: { kind: "turn", turn: content.hold.frozen, fresh: false } }
      }
      return {
        kind: "work-map",
        card: newest === undefined ? NO_CARD : { kind: "turn", turn: newest, fresh: false },
      }
    case "report":
      return {
        kind: "report",
        card:
          newest === undefined ? NO_CARD : { kind: "turn", turn: newest, fresh: content.arrived },
      }
  }
}

const NO_CARD = { kind: "none" } as const satisfies ShownCard

function shownKeyOf(view: ShownView): string {
  if (view.kind === "welcome" || view.card.kind === "none") {
    return NO_SHOWN_KEY
  }
  return `${view.kind}:${String(view.card.turn.id)}`
}

function positionLabel(turns: readonly MainViewTurn[], turnId: number): string {
  const index = turns.findIndex((turn) => turn.id === turnId)
  return `${String(index + 1)} / ${String(turns.length)}`
}

/** いちばん新しい依頼の今の段。 */
function newestPhaseOf(state: SessionState): WorkPhase {
  const steps = currentTurnStepsOf(state.records, state.endedReason !== undefined)
  return steps.kind === "turn" ? currentPhaseOf(steps.plan) : { kind: "none" }
}
