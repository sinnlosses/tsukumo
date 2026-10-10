// メインビュー本体。いま出している中身（迎える口・働くあいだの札・レポート）を出し分ける。
//
// 1ターン＝1枚の札。直近 `MAX_MAIN_VIEW_TURNS` 件をやり取りの列のやり取りの行と `[` `]` のキーで行き来する。
// 選んでいるターン（`turnId`）は `useTurnSelection` から読む（キャラビューの吹き出しも同じ選択に従うため、領域のローカル状態にしない）。
// 最新を見ているあいだの中身は `useMainViewContent` が決め、過去のターンを見ているあいだはそのターンのレポートを出す。
//
// レポートに書かれたパスを押せる部品にする一覧・依頼は `<RepositoryFileLinkProvider>` が配る。
// メインビューの中でしか描かないので、ここで1回だけ mount する。

import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react"

import { conversationMoment } from "../../../../../../shared/session/conversation-moment.ts"
import type { MainViewTurn } from "../../../../../../shared/session/main-view.ts"
import type { TurnStepList } from "../../../../../../shared/session/turn-step.ts"
import {
  currentPhaseOf,
  plannedPhasesOf,
  type WorkPhase,
} from "../../../../../../shared/session/work-plan.ts"
import { useCurrentTurnSteps } from "../../../../../stores/current-turn-steps.ts"
import { useInquiryJump } from "../../../../../stores/inquiry-jump.ts"
import {
  type MainViewContent,
  useMainViewContent,
} from "../../../../../stores/main-view-content.ts"
import { useMainViewTurns } from "../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../stores/turn-selection.ts"
import { CurrentStep } from "./components/current-step/current-step.tsx"
import { InquiryJumpFloat } from "./components/inquiry-jump-float/inquiry-jump-float.tsx"
import { Inquiry } from "./components/inquiry/inquiry.tsx"
import { MiniPortrait } from "./components/mini-portrait/mini-portrait.tsx"
import { PhaseList } from "./components/phase-list/phase-list.tsx"
import { ReportOutline } from "./components/report-outline/report-outline.tsx"
import { RequestBlock } from "./components/request-block/request-block.tsx"
import { TurnCardHead } from "./components/turn-card-head/turn-card-head.tsx"
import { Turn } from "./components/turn/turn.tsx"
import { Welcome } from "./components/welcome/welcome.tsx"
import { WorkStrip } from "./components/work-strip/work-strip.tsx"
import { headNoticeOf, type HeadNoticeAction } from "./domain/head-notice.ts"
import { neighborTurnId, turnStepOf } from "./domain/turn-step-key.ts"
import { NO_SHOWN_KEY, useActiveTurnScroll } from "./hooks/use-active-turn-scroll.ts"
import { useReportOutlineTurns } from "./hooks/use-report-outline-turns.ts"
import styles from "./main-view.module.css"
import { RepositoryFileLinkProvider } from "./markdown/repository-link.tsx"

export { InquiryCard } from "./components/inquiry/inquiry.tsx"

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
  const requestInquiryJump = useInquiryJump((state) => state.requestJump)
  const moment = useSession((session) => conversationMoment(session.state))
  const turnStepList = useCurrentTurnSteps()
  const phase: WorkPhase =
    turnStepList.kind === "turn" ? currentPhaseOf(turnStepList.plan) : { kind: "none" }
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
    if (action === "to-inquiry") {
      requestInquiryJump({ focus: false })
    }
  }

  const cardTurn = view.kind !== "welcome" && view.card.kind === "turn" ? view.card : undefined
  const outlineTurns = useReportOutlineTurns()

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    const step = turnStepOf({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      isComposing: event.nativeEvent.isComposing,
      target: event.target,
    })
    if (step === undefined || cardTurn === undefined) {
      return
    }
    event.preventDefault()
    const target = neighborTurnId(
      turns.map((turn) => turn.id),
      cardTurn.turn.id,
      step,
    )
    if (target !== undefined) {
      selectTurn(target)
    }
  }

  return (
    <RepositoryFileLinkProvider>
      {/* `data-brush-origin`: ミニ立ち絵を置く座標の原点。`data-main-view`: フォーカスがメインビューの中にあるかを他の部品から探す印。
          印の名前はそれぞれ `BRUSH_ORIGIN_ATTRIBUTE`・`MAIN_VIEW_ATTRIBUTE` と揃える（JSX の属性名に定数を書けないので直に置く）。 */}
      <div
        className={styles["main-turns"]}
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
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
          {view.kind === "welcome" && (
            <>
              <Welcome />
              <Inquiry />
            </>
          )}
          {cardTurn !== undefined && (
            <article className={styles["turn-card"]}>
              <ReportOutline
                turns={outlineTurns}
                activeTurnId={cardTurn.turn.id}
                onSelectTurn={selectTurn}
                notice={notice}
                onNotice={onNotice}
              >
                {!viewingPast && (
                  <TurnCardHead rootRef={rootRef}>
                    <WorkStrip />
                  </TurnCardHead>
                )}
                {cardTurn.turn.request !== undefined && (
                  <div className={styles["turn-card-request"]}>
                    <RequestBlock request={cardTurn.turn.request} key={cardTurn.turn.id} />
                  </div>
                )}
                <div className={styles["turn-card-body"]}>
                  {/* 狭い画面の一覧と「いまの段」。広い画面では CSS で消える。
                      一覧の板の中の本文を、`<Turn>` が隠した同じ本文より DOM の前に置くため、`<Turn>` の前に並べる。 */}
                  <PhaseList
                    turn={cardTurn.turn}
                    planCount={viewingPast ? 0 : planCountOf(turnStepList)}
                    turnId={cardTurn.turn.id}
                    key={cardTurn.turn.id}
                  />
                  {!viewingPast && view.kind === "work" && <CurrentStep />}
                  {/* `key` にターンの番号を渡す。
                    前後へ移っても同じ位置の `<Turn>` を使い回すと、「このターンを出し始めた時点で既にあった本文」（演出の対象を決める材料）が最初のターンのものに留まってしまう。 */}
                  <Turn
                    turn={cardTurn.turn}
                    newest={cardTurn.turn.id === newestTurnId}
                    freshReport={cardTurn.fresh}
                    key={cardTurn.turn.id}
                  />
                </div>
                {!viewingPast && (
                  <div className={styles["turn-card-inquiry"]}>
                    <Inquiry />
                  </div>
                )}
              </ReportOutline>
            </article>
          )}
        </ContentFrame>
        {!viewingPast && <InquiryJumpFloat />}
        {/* 筆先に添うミニ立ち絵。この入れ物の原点を基準に置く（`position: absolute`）ので、書き上げたあと残っているあいだも本文と一緒に転がる。
            出ているやり取りを渡すのは、残った筆先が別のやり取りのものなら引っ込ませるため。 */}
        {cardTurn !== undefined && <MiniPortrait shownTurnId={cardTurn.turn.id} />}
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

/** 見ているやり取りの段取りの段の数。段取りが無ければ 0。 */
function planCountOf(turnStepList: TurnStepList): number {
  return turnStepList.kind === "turn" && turnStepList.plan.kind === "planned"
    ? plannedPhasesOf(turnStepList.plan).length
    : 0
}

const NO_CARD = { kind: "none" } as const satisfies ShownCard

function shownKeyOf(view: ShownView): string {
  if (view.kind === "welcome" || view.card.kind === "none") {
    return NO_SHOWN_KEY
  }
  return `${view.kind}:${String(view.card.turn.id)}`
}
