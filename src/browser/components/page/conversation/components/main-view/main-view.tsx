// メインビュー本体。いま出している中身（迎える口・働くあいだの札・レポート）を出し分ける。
//
// 1ターン＝1枚の札。直近 `MAX_MAIN_VIEW_TURNS` 件を札の頭の `‹` `›` で行き来する。
// 選んでいるターン（`turnId`）は `useTurnSelection` から読む（キャラビューの吹き出しも同じ選択に従うため、領域のローカル状態にしない）。
// 最新を見ているあいだの中身は `useMainViewContent` が決め、過去のターンを見ているあいだはそのターンのレポートを出す。
//
// レポートに書かれたパスを押せる部品にする一覧・依頼は `<RepositoryFileLinkProvider>` が配る。
// メインビューの中でしか描かないので、ここで1回だけ mount する。

import { useLayoutEffect, useRef, type ReactElement, type ReactNode, type RefObject } from "react"
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
import { MiniPortrait } from "./components/mini-portrait/mini-portrait.tsx"
import { QuestionAsk } from "./components/question-ask/question-ask.tsx"
import { ReportOutline } from "./components/report-outline/report-outline.tsx"
import { TurnCardHead } from "./components/turn-card-head/turn-card-head.tsx"
import { TurnHeader } from "./components/turn-header/turn-header.tsx"
import { Turn } from "./components/turn/turn.tsx"
import { Welcome } from "./components/welcome/welcome.tsx"
import { WorkStrip } from "./components/work-strip/work-strip.tsx"
import { headNoticeOf, type HeadNoticeAction } from "./domain/head-notice.ts"
import { turnHistoryText, turnRequestRest, turnTitle } from "./domain/turn-title.ts"
import { NO_SHOWN_KEY, useActiveTurnScroll } from "./hooks/use-active-turn-scroll.ts"
import styles from "./main-view.module.css"
import { RepositoryFileLinkProvider } from "./markdown/repository-link.tsx"

/** 画面に出す中身。`card` は札に載せるターンで、`fresh` は働くあいだの中身から入れ替えたばかりのレポートか。 */
type ShownView =
  | { readonly kind: "welcome" }
  | { readonly kind: "work" | "report"; readonly card: ShownCard }

type ShownCard =
  | { readonly kind: "none" }
  | { readonly kind: "turn"; readonly turn: MainViewTurn; readonly fresh: boolean }

export function MainView(): ReactElement {
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  // 畳んだ結果は姿ごとに1回だけ作られる（昇順。追従を決める `useTurnSelection` と同じものを読む）。
  const turns = useMainViewTurns()
  const content = useMainViewContent((state) => state.content)
  const requestQuestionScroll = useQuestionScroll((state) => state.requestScroll)
  const moment = useSession((session) => conversationMoment(session.state))
  const phase = useSession(useShallow((session) => newestPhaseOf(session.state)))
  const rootRef = useRef<HTMLDivElement>(null)
  const carriedFocusRef = useRef(false)

  const viewing: Viewing =
    activeTurnId !== undefined && activeTurnId !== newestTurnId
      ? { kind: "past", turnId: activeTurnId }
      : { kind: "newest" }
  const viewingPast = viewing.kind === "past"
  const view = shownView(content, turns, viewing)
  useActiveTurnScroll(rootRef, shownKeyOf(view))

  const notice = headNoticeOf({ content, moment, viewingPast, phase })

  function onNotice(action: HeadNoticeAction): void {
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
      {/* `data-brush-origin`: ミニ立ち絵を置く座標の原点。`data-main-view`: フォーカスがメインビューの中にあるかを他の部品から探す印。
          印の名前はそれぞれ `BRUSH_ORIGIN_ATTRIBUTE`・`MAIN_VIEW_ATTRIBUTE` と揃える（JSX の属性名に定数を書けないので直に置く）。 */}
      <div
        className={styles["main-turns"]}
        ref={rootRef}
        tabIndex={-1}
        data-brush-origin=""
        data-main-view=""
      >
        {/* 中身の種類が替わったときだけ作り直し、そのときだけ現れる動きが1回掛かる。 */}
        <ContentFrame
          key={view.kind}
          kind={view.kind}
          rootRef={rootRef}
          carriedFocusRef={carriedFocusRef}
        >
          {view.kind === "welcome" && <Welcome />}
          {cardTurn !== undefined && (
            <article className={styles["turn-card"]}>
              <TurnCardHead rootRef={rootRef}>
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
                {!viewingPast && <WorkStrip />}
              </TurnCardHead>
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
        </ContentFrame>
        {/* 筆先に添うミニ立ち絵。この入れ物の原点を基準に置く（`position: absolute`）ので、書き上げたあと残っているあいだも本文と一緒に転がる。
            出ているやり取りを渡すのは、残った筆先が別のやり取りのものなら引っ込ませるため。 */}
        {cardTurn !== undefined && <MiniPortrait shownTurnId={cardTurn.turn.id} />}
        {/* 答え待ちの質問の札。いまのやり取りのレポートの下に出す（読み終わった先に質問が来る並び）。
            答え待ちが無ければ何も描かない。 */}
        <QuestionAsk />
      </div>
    </RepositoryFileLinkProvider>
  )
}

/**
 * 中身の器。
 * 作り直しで外れる器の中にフォーカスがあったら、新しい器を付けた直後にメインビューの根へ移す。
 * 外れた要素のフォーカスは `body` に落ち、そのままだと入力欄がフォーカスを寄せてしまう。
 */
function ContentFrame({
  kind,
  rootRef,
  carriedFocusRef,
  children,
}: {
  readonly kind: ShownView["kind"]
  readonly rootRef: RefObject<HTMLElement | null>
  readonly carriedFocusRef: RefObject<boolean>
  readonly children: ReactNode
}): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (carriedFocusRef.current) {
      carriedFocusRef.current = false
      rootRef.current?.focus({ preventScroll: true })
    }
    return () => {
      carriedFocusRef.current = frame !== null && frame.contains(document.activeElement)
    }
  }, [rootRef, carriedFocusRef])
  return (
    <div ref={frameRef} className={styles["main-view-content"]} data-main-view-content={kind}>
      {children}
    </div>
  )
}

/** 見ているターン。過去のターンを見ているあいだは、そのターンのレポートを出す。 */
type Viewing = { readonly kind: "newest" } | { readonly kind: "past"; readonly turnId: number }

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
    case "work":
      return {
        kind: "work",
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
