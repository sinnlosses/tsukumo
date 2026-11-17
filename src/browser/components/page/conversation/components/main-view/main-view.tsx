// メインビュー本体。いま出している中身（始め方の一覧・働くあいだのカード・レポート）を出し分ける。
//
// 1ターン＝1枚の札。直近 `MAX_MAIN_VIEW_TURNS` 件をやり取りの列のやり取りの行と `[` `]` のキーで行き来する。
// 選んでいるターン（`turnId`）は `useTurnSelection` から読む（キャラビューの吹き出しも同じ選択に従うため、領域のローカル状態にしない）。
// 最新を見ているあいだの中身は `useMainViewContent` が決め、過去のターンを見ているあいだはそのターンのレポートを出す。
//
// レポートに書かれたパスを押せる部品にする一覧・依頼は `<RepositoryFileLinkProvider>` が配る。
// メインビューの中でしか描かないので、ここで1回だけ mount する。

import clsx from "clsx"
import {
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react"

import { conversationMoment } from "../../../../../../shared/session/conversation-moment.ts"
import type { MainViewTurn } from "../../../../../../shared/session/main-view-shape.ts"
import type { TurnStepList } from "../../../../../../shared/session/turn-step.ts"
import {
  currentPhaseOf,
  plannedPhasesOf,
  type WorkPhase,
} from "../../../../../../shared/session/work-plan.ts"
import { DEFAULT_CHARACTER_NAME } from "../../../../../domain/portrait-appearance.ts"
import { RepositoryFileLinkProvider } from "../../../../../features/report/repository-link.tsx"
import { useBeforePaintSync } from "../../../../../hooks/use-before-paint-sync.ts"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import { useCurrentTurnSteps } from "../../../../../stores/current-turn-step-list.ts"
import { useInquiryJump } from "../../../../../stores/inquiry-jump.ts"
import { useMainViewTurns } from "../../../../../stores/main-view-turn.ts"
import { useReadingSection } from "../../../../../stores/reading-section.ts"
import { useSession } from "../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../stores/turn-selection.ts"
import { useAwaySeam } from "../../stores/away-seam.ts"
import { type MainViewContent, useMainViewContent } from "../../stores/main-view-content.ts"
import { useStickToBottom } from "../hooks/use-stick-to-bottom.ts"
import { Inquiry } from "../inquiry/inquiry.tsx"
import { AskThreadProvider } from "./ask-thread-provider.tsx"
import { CurrentStep } from "./current-step.tsx"
import { headNoticeOf, type HeadNoticeAction } from "./domain/head-notice.ts"
import { headingStepOf, neighborTurnId, turnStepOf } from "./domain/turn-step-key.ts"
import { NO_VOICE_SLOT } from "./domain/voice-slot.ts"
import { HeadNotice } from "./head-notice.tsx"
import { scrollerOf } from "./hooks/scroll-frame.ts"
import { type ShownTarget, useActiveTurnScroll } from "./hooks/use-active-turn-scroll.ts"
import { useTailReturn } from "./hooks/use-tail-return.ts"
import { useVoiceSlot } from "./hooks/use-voice-slot.ts"
import styles from "./main-view.module.css"
import { NowLine } from "./now-line.tsx"
import { PhaseList } from "./phase-list.tsx"
import { RequestBlock } from "./request-block.tsx"
import { VoiceSlotRow, WelcomeVoiceSlot } from "./stream-card.tsx"
import { StreamFloat } from "./stream-float.tsx"
import { TurnCardHead } from "./turn-card-head.tsx"
import { Turn } from "./turn.tsx"
import { Welcome } from "./welcome.tsx"
import { WorkStrip } from "./work-strip.tsx"

export { ReportOutline } from "./report-outline.tsx"

/** 画面に出す中身。`card` は札に載せるターンで、`fresh` は働くあいだの中身から入れ替えたばかりのレポートか。 */
type ShownView =
  | { readonly kind: "waiting" }
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
  const tasks = useSession((session) => session.state.tasks)
  const recordCount = useSession((session) => session.state.records.length)
  const awaitingHello = useSession((session) => session.generation === 0)
  const requestInquiryJump = useInquiryJump((state) => state.requestJump)
  const moment = useSession((session) => conversationMoment(session.state))
  const turnStepList = useCurrentTurnSteps()
  const phase: WorkPhase =
    turnStepList.kind === "turn" ? currentPhaseOf(turnStepList.plan) : { kind: "none" }
  const phoneWidth = usePhoneWidth()
  const rootRef = useRef<HTMLDivElement>(null)
  const carriedFocusRef = useRef(false)

  // 別のやり取りを選んだら線を外す（見ているやり取りが、線を出したやり取りと違うあいだ）。
  const awayTurnId = useAwaySeam((state) => state.away?.turnId)
  const dismissAwaySeam = useAwaySeam((state) => state.dismiss)
  useExternalSync(() => {
    if (awayTurnId !== undefined && activeTurnId !== undefined && activeTurnId !== awayTurnId) {
      dismissAwaySeam()
    }
  }, [awayTurnId, activeTurnId, dismissAwaySeam])

  const viewing: Viewing =
    activeTurnId !== undefined && activeTurnId !== newestTurnId
      ? { kind: "past", turnId: activeTurnId }
      : { kind: "newest" }
  const viewingPast = viewing.kind === "past"
  const view: ShownView = awaitingHello ? { kind: "waiting" } : shownView(content, turns, viewing)
  useActiveTurnScroll(rootRef, shownTargetOf(view))
  // 新しい行が届いたら下端へ追従するのは、働くあいだだけ。レポートを出しているあいだは頭から読ませる。
  const stickToBottom = useStickToBottom(recordCount, {
    scrollerOf,
    follow: view.kind === "work" && !viewingPast,
  })

  const tail = useTailReturn(rootRef, recordCount, view.kind === "work" && !viewingPast)
  const notice = headNoticeOf({ content, moment, viewingPast, phase })

  function onNotice(action: HeadNoticeAction): void {
    if (newestTurnId !== undefined) {
      selectTurn(newestTurnId)
    }
    if (action === "to-inquiry") {
      requestInquiryJump({ focus: false })
    }
  }

  const cardTurn =
    view.kind !== "welcome" && view.kind !== "waiting" && view.card.kind === "turn"
      ? view.card
      : undefined
  const moveHeading = useReadingSection((state) => state.move)
  const shownVoice = useVoiceSlot()
  const voice = phoneWidth || viewingPast ? NO_VOICE_SLOT : shownVoice
  const speakerName =
    useSession((session) => session.state.character?.name) ?? DEFAULT_CHARACTER_NAME

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    const keyEvent = {
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      isComposing: event.nativeEvent.isComposing,
      target: event.target,
    }
    const headingStep = headingStepOf(keyEvent)
    if (headingStep !== undefined) {
      if (cardTurn !== undefined) {
        event.preventDefault()
        moveHeading(headingStep)
      }
      return
    }
    const step = turnStepOf(keyEvent)
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
      {/* `data-main-view`: フォーカスがメインビューの中にあるかを他の部品から探す印。
          印の名前は `MAIN_VIEW_ATTRIBUTE` と揃える（JSX の属性名に定数を書けないので直に置く）。 */}
      <div
        className={styles["main-turns"]}
        ref={(element) => {
          rootRef.current = element
          return stickToBottom(element)
        }}
        tabIndex={-1}
        onKeyDown={onKeyDown}
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
              <div className={styles["welcome-scene"]}>
                <Welcome />
                {!phoneWidth && <WelcomeVoiceSlot voice={shownVoice} speakerName={speakerName} />}
              </div>
              <Inquiry />
            </>
          )}
          {cardTurn !== undefined && (
            <article
              className={clsx(
                styles["turn-card"],
                cardTurn.turn.steps.some((step) => step.mark === "final") &&
                  styles["has-final-report"],
              )}
            >
              {phoneWidth && notice.kind === "notice" && (
                <div className={styles["turn-card-phone-notice"]}>
                  <HeadNotice
                    text={notice.text}
                    onPress={() => {
                      onNotice(notice.action)
                    }}
                  />
                </div>
              )}
              {!viewingPast && (
                <TurnCardHead>
                  <WorkStrip />
                </TurnCardHead>
              )}
              {/* 狭い画面は依頼を一覧の上に出す（広い画面は流れの先頭の投稿が持つ）。 */}
              {phoneWidth && cardTurn.turn.request !== undefined && (
                <div className={styles["turn-card-request"]}>
                  <RequestBlock
                    request={cardTurn.turn.request}
                    tasks={tasks}
                    key={cardTurn.turn.id}
                  />
                </div>
              )}
              <div className={styles["turn-card-body"]}>
                <AskThreadProvider turn={cardTurn.turn} turns={turns}>
                  {/* 狭い画面の一覧と「いまの段」。広い画面では CSS で消える。
                      一覧の板の中の本文を、`<Turn>` が隠した同じ本文より DOM の前に置くため、`<Turn>` の前に並べる。 */}
                  <PhaseList
                    turn={cardTurn.turn}
                    planCount={viewingPast ? 0 : planCountOf(turnStepList)}
                    turnId={cardTurn.turn.id}
                    key={`phase-list:${String(cardTurn.turn.id)}`}
                  />
                  {phoneWidth && !viewingPast && view.kind === "work" && <CurrentStep />}
                  {/* `key` にターンの番号を渡す。
                    前後へ移っても同じ位置の `<Turn>` を使い回すと、「このターンを出し始めた時点で既にあった本文」（演出の対象を決める材料）が最初のターンのものに留まってしまう。 */}
                  <Turn
                    turn={cardTurn.turn}
                    newest={cardTurn.turn.id === newestTurnId}
                    freshReport={cardTurn.fresh}
                    voice={voice}
                    key={cardTurn.turn.id}
                  />
                </AskThreadProvider>
              </div>
              {!phoneWidth && <NowLine viewingPast={viewingPast} />}
              {voice.kind === "voice" && (
                <VoiceSlotRow text={voice.text} time={voice.time} speakerName={speakerName} />
              )}
              {!viewingPast && (
                <div className={styles["turn-card-inquiry"]}>
                  <Inquiry />
                </div>
              )}
            </article>
          )}
        </ContentFrame>
        <StreamFloat notice={notice} viewingPast={viewingPast} onNotice={onNotice} tail={tail} />
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
  // ref コールバックにしないのは、付け直しのたびに記録と復元が走って、再描画でフォーカスを根へ奪うため。
  // 付け直しを止めるのは Compiler だけで、通さない単体テストでは止まらない。
  useBeforePaintSync(() => {
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

/** 見ているやり取りのワークプランの段の数。ワークプランが無ければ 0。 */
function planCountOf(turnStepList: TurnStepList): number {
  return turnStepList.kind === "turn" && turnStepList.plan.kind === "planned"
    ? plannedPhasesOf(turnStepList.plan).length
    : 0
}

const NO_CARD = { kind: "none" } as const satisfies ShownCard

function shownTargetOf(view: ShownView): ShownTarget {
  if (view.kind === "welcome" || view.kind === "waiting" || view.card.kind === "none") {
    return { kind: "none" }
  }
  return { kind: view.kind, turnId: view.card.turn.id }
}
