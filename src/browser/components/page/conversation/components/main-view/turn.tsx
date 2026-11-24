// 1つのやり取りの流れ。
// 選んだやり取りの記録を、記録の位置の順に1本で積む（`streamItemsOf`）。
// 依頼・補足は右寄せの投稿、セリフ・反応は左寄せの行、段・質問の記録・レポートは流れの中の札と紙。
// 最終レポートのある閉じたやり取りは、最終レポートの上に「作業の経過」の1行（段の札・質問の記録・中間の本文を畳んだもの）を置く。
// ツールの実行は描かない（進行は帯の「いまの作業」が持つ）。
// 失敗で終わった・利用者が止めたやり取りは、その記録の位置（やり取りの末尾）に失敗・中断の表示を出す（色だけでなく字で成功と見分ける）。

import clsx from "clsx"
import { Fragment, useState, type ReactElement, type ReactNode } from "react"

import type { TaskSummaryResult } from "../../../../../../shared/repository/task-summary.ts"
import { conversationMoment } from "../../../../../../shared/session/conversation-moment.ts"
import {
  isInterimStep,
  type MainViewStep,
  type MainViewTurn,
} from "../../../../../../shared/session/main-view-shape.ts"
import { DEFAULT_CHARACTER_NAME } from "../../../../../domain/portrait-appearance.ts"
import { ReplyPortContext } from "../../../../../features/report/reply-port.ts"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import { useConversationStreamRows } from "../../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../../stores/session.ts"
import { Text } from "../../../../ui/text/text.tsx"
import { useAwaySeam } from "../../stores/away-seam.ts"
import { useDraftedReports } from "../../stores/drafted-report.ts"
import { useViewedSpeech } from "../../stores/viewed-speech.ts"
import { AnswerPost } from "./answer-post.tsx"
import { awaySeamOf, type AwaySeam } from "./domain/away-seam.ts"
import { revealStepIdOf } from "./domain/draft-reveal.ts"
import { REPORT_STEP_ATTRIBUTE, REPORT_STEP_FINAL_VALUE } from "./domain/outline-report-head.ts"
import {
  streamGroupsOf,
  streamItemsOf,
  type StreamGroup,
  type StreamItem,
} from "./domain/stream-item-list.ts"
import {
  PLAIN_PRESENTATION,
  pinnedPlaceOf,
  streamPresentationOf,
  type RowPresentation,
} from "./domain/stream-presentation.ts"
import { NO_VOICE_SLOT, withoutVoiceRow, type VoiceSlot } from "./domain/voice-slot.ts"
import { DraftReport } from "./draft-report.tsx"
import { FoldedStep, StepReport } from "./folded-step.tsx"
import { useArrivingBubble } from "./hooks/use-arriving-bubble.ts"
import { useReplyPort } from "./hooks/use-reply-port.ts"
import styles from "./main-view.module.css"
import { ProgressFold } from "./progress-fold.tsx"
import { QuestionRecord } from "./question-record.tsx"
import { AwaySeamLine, PostRow, SayRow } from "./stream-card.tsx"
import { TurnFailureBlock } from "./turn-failure-block.tsx"
import { VoiceBandPortal } from "./voice-band.tsx"

type TurnProps = {
  readonly turn: MainViewTurn
  /** 今回（いちばん新しい）のやり取りか。演出を掛けてよいのは今回だけで、過去のターンでは本文が最初から全部出ている。 */
  readonly newest: boolean
  /** 出し始めた時点で既にある最終レポートも、まだ読まれていないものとして演出するか（地図から入れ替えたばかりのレポート）。 */
  readonly freshReport: boolean
  /** 入力欄の上の定位置が出している声。その記録は流れの行から除く。 */
  readonly voice?: VoiceSlot
  /** 直近のセリフ1件を流れから外し、入力欄の上の声の帯に描くか。 */
  readonly band?: boolean
}

export function Turn(props: TurnProps): ReactElement {
  const { turn } = props
  const finalStep = finalReportStep(turn)
  // このやり取りを出し始めた時点で既にあった本文は演出しない。
  // 過去のターンを開いたとき・ページを読み込み直したときは「確定済みの本文が一度も書かれない」ので、あとから現れた本文だけが対象になる。
  // この初期値がやり取りごとに取り直されるのは、`<MainView>` がやり取りの番号を `key` に渡すため。
  const [stepIdAtMount] = useState(props.freshReport ? undefined : finalStep?.id)
  const draftedToolUseIds = useDraftedReports((state) => state.toolUseIds)
  const rememberDrafts = useDraftedReports((state) => state.remember)
  // 草稿は確定版がステップに出た時点で外れ、この部品もやり取りを選び直すと作り直されるので、描いたことは部品の外の store に書く。
  // 描画中に書くとほかの部品の描画中の更新になるので、描いたあとに書く。
  useExternalSync(() => {
    rememberDrafts(turn.drafts.map((draft) => draft.toolUseId))
  }, [turn.drafts, rememberDrafts])
  const revealStepId = revealStepIdOf({
    newest: props.newest,
    finalStep,
    stepIdAtMount,
    draftedToolUseIds,
  })
  const phoneWidth = usePhoneWidth()
  const rows = withoutVoiceRow(useConversationStreamRows(turn.id), props.voice ?? NO_VOICE_SLOT)
  // 狭い画面の依頼は、一覧の上の依頼の塊が持つ。
  const shownRows = rows.filter(
    (row) => !phoneWidth || row.kind !== "post" || row.record.kind !== "request",
  )
  // 答えの投稿は広い画面だけ。狭い画面は札のまま。
  const items = streamItemsOf(shownRows, turn).filter(
    (item) => !phoneWidth || item.kind !== "answer",
  )
  const questionForm = phoneWidth ? "card" : "asked"
  const redoToolUseId = props.newest ? lastQuestionToolUseId(turn) : NO_QUESTION
  const generation = useSession((session) => session.generation)
  const away = useAwaySeam((state) => state.away)
  const latestStepId = props.newest ? finalStep?.id : undefined
  const port = useReplyPort()
  const tasks = useSession((session) => session.state.tasks)
  const viewed = useViewedSpeech((state) => state.viewed)
  const moment = useSession((session) => conversationMoment(session.state))
  const speakerName =
    useSession((session) => session.state.character?.name) ?? DEFAULT_CHARACTER_NAME
  const arrivingBubble = useArrivingBubble()
  const presentations = streamPresentationOf(items, {
    live: props.newest && (moment === "work" || moment === "ask"),
    follow: !phoneWidth && props.voice?.kind !== "voice",
    pinned: pinnedPlaceOf(items, turn.id, viewed),
    ...(props.newest && arrivingBubble.kind === "arriving" && arrivingBubble.turnId === turn.id
      ? { arriving: { index: arrivingBubble.index, bubble: arrivingBubble.bubble } }
      : {}),
  })
  // 尾・明るさ・出方は帯へ移すセリフも流れの中の位置で決めてから、流れの並びから外す。
  const bandIndex = props.band === true ? items.findLastIndex((item) => item.kind === "say") : -1
  const bandItem = items[bandIndex]
  const streamItems = items.filter((_item, index) => index !== bandIndex)
  const streamPresentations = presentations.filter((_presentation, index) => index !== bandIndex)
  const groups = streamGroupsOf(streamItems)
  const hasContent = streamItems.length > 0 || turn.drafts.length > 0
  // 狭い画面では流れの行を描かないので、線も出さない。
  const seam =
    !phoneWidth && away?.generation === generation && away.turnId === turn.id
      ? awaySeamOf({ away, rows, items: streamItems })
      : NO_SEAM

  return (
    <ReplyPortContext value={{ kind: "open", port }}>
      {bandItem?.kind === "say" && (
        <VoiceBandPortal>
          <SayRow
            row={bandItem}
            turnId={turn.id}
            presentation={presentations[bandIndex] ?? PLAIN_PRESENTATION}
            speakerName={speakerName}
          />
        </VoiceBandPortal>
      )}
      <div {...endsWithSayAttribute(streamItems, turn.drafts.length)}>
        {turn.droppedCount > 0 && (
          <Text
            element="p"
            size="secondary"
            tone="ink-quiet"
            weight="inherit"
            className={styles["turn-dropped"]}
          >
            これ以前の {turn.droppedCount} 件は省略した
          </Text>
        )}
        {hasContent && (
          <div className={styles["conversation-stream"]}>
            {/* `key` は配列の添字ではなく、記録の位置と本文のステップの `step.id`（`MainViewStep.id`。古いステップを落とす前に振った通し番号）を使う。
              添字だと、古いステップが落ちて残りの添字が1つずつ前へずれた瞬間に React が別のステップの DOM を使い回してしまい、`<details>` の `open` のような制御されていない DOM の状態が別のステップへ乗り移って見える。 */}
            {groups.map((group) => (
              <div
                key={groupKey(group)}
                className={styles["stream-group"]}
                data-stream-group={group.speaker}
              >
                {group.items.map((item, offset) => (
                  <Fragment key={streamItemKey(item, group.start + offset)}>
                    {seam.kind === "seam" && seam.before === group.start + offset && (
                      <AwaySeamLine label={seam.label} />
                    )}
                    <StreamItemView
                      item={item}
                      turn={turn}
                      tasks={tasks}
                      presentation={streamPresentations[group.start + offset] ?? PLAIN_PRESENTATION}
                      speakerName={speakerName}
                      newest={props.newest}
                      questionForm={questionForm}
                      redoToolUseId={redoToolUseId}
                      isRevealed={(stepId) => stepId === revealStepId}
                      isLatest={(stepId) => stepId === latestStepId}
                    />
                  </Fragment>
                ))}
              </div>
            ))}
            {/* `key` を `toolUseId` にするので、書いている途中の部品から記録の部品へ移っても面を作り直さない。 */}
            {turn.drafts.map((draft) => (
              <DraftReport
                draft={draft}
                turnId={turn.id}
                hasInterimReport={turn.hasInterimReport}
                key={`draft:${draft.toolUseId}`}
              />
            ))}
          </div>
        )}
      </div>
    </ReplyPortContext>
  )
}

function lastQuestionToolUseId(turn: MainViewTurn): string {
  return (
    turn.steps
      .flatMap((step) => step.actions)
      .filter((action) => action.kind === "question")
      .at(-1)?.toolUseId ?? NO_QUESTION
  )
}

/** どの `toolUseId` とも一致しない印（質問が無い・古いやり取り）。 */
const NO_QUESTION = ""

const NO_SEAM = { kind: "none" } as const satisfies AwaySeam

/** 流れの末尾がセリフのとき、続くお伺いの札をそのセリフと1組に見せる印。 */
function endsWithSayAttribute(
  items: readonly StreamItem[],
  draftCount: number,
): { readonly "data-ends-with-say"?: "" } {
  return draftCount === 0 && items[items.length - 1]?.kind === "say"
    ? { "data-ends-with-say": "" }
    : {}
}

/** 締めのセリフはあとから紙の後ろに加わるので、頭の行の `key` を組の `key` にして、加わっても紙を作り直さない。 */
function groupKey(group: StreamGroup): string {
  const head = group.items[0]
  return head === undefined ? `group:${String(group.start)}` : streamItemKey(head, group.start)
}

function streamItemKey(item: StreamItem, index: number): string {
  switch (item.kind) {
    case "body":
      return `body:${String(item.step.id)}`
    case "question":
      return `question:${item.entry.toolUseId}`
    case "answer":
      return `answer:${item.entry.toolUseId}`
    case "fold":
      return "fold"
    case "failure":
      return "failure"
    case "post":
    case "say":
      return `${item.kind}:${String(index)}`
  }
}

type StreamItemViewProps = {
  readonly item: StreamItem
  readonly turn: MainViewTurn
  readonly tasks: TaskSummaryResult
  readonly presentation: RowPresentation
  /** 読み上げ用のキャラクターの名前。 */
  readonly speakerName: string
  readonly newest: boolean
  readonly questionForm: "card" | "asked"
  /** 「答え直す」を付ける答えの `toolUseId`。いちばん新しいやり取りの最後の答え。 */
  readonly redoToolUseId: string
  /** 書き上げる演出を掛けるステップか。 */
  readonly isRevealed: (stepId: number) => boolean
  /** いちばん新しいやり取りの最後のレポートか。 */
  readonly isLatest: (stepId: number) => boolean
}

function StreamItemView(props: StreamItemViewProps): ReactNode {
  const { item, turn } = props
  switch (item.kind) {
    case "post":
      return (
        <PostRow turn={turn} tasks={props.tasks} row={item} presentation={props.presentation} />
      )
    case "say":
      return (
        <SayRow
          row={item}
          turnId={turn.id}
          presentation={props.presentation}
          speakerName={props.speakerName}
        />
      )
    case "question":
      return <QuestionRecord entry={item.entry} form={props.questionForm} />
    case "answer":
      return <AnswerPost entry={item.entry} redo={item.entry.toolUseId === props.redoToolUseId} />
    case "failure":
      return (
        <TurnFailureBlock
          ending={item.ending}
          remains={item.remains}
          requestText={turn.request?.text ?? ""}
          newest={props.newest}
        />
      )
    case "fold":
      return (
        <ProgressFold
          items={item.items}
          turn={turn}
          tasks={props.tasks}
          questionForm={props.questionForm}
          redoToolUseId={props.redoToolUseId}
          speakerName={props.speakerName}
        />
      )
    case "body":
      return (
        <Step
          step={item.step}
          turnId={turn.id}
          reveal={props.isRevealed(item.step.id)}
          latest={props.isLatest(item.step.id)}
          hasInterimReport={turn.hasInterimReport}
        />
      )
  }
}

type StepProps = {
  readonly step: MainViewStep
  /** このステップが載っているやり取り（`<Report>` から筆先へ渡る）。 */
  readonly turnId: number
  readonly reveal: boolean
  /** いちばん新しいやり取りの最後のレポートか。その次の一手を入力欄の頭の並びへ載せる。 */
  readonly latest: boolean
  /** このステップが載っているやり取りに中間レポートがあるか（`MainViewTurn.hasInterimReport`）。 */
  readonly hasInterimReport: boolean
}

/**
 * ステップの本文の札。
 *
 * 中間レポート（`step.mark` が `interim-kept` か `interim-folded`）は話が途中の本文なので、タスク見出し行にラベルを載せて地と枠を変える（`.main-step.is-interim`）。
 *
 * 最終レポート（`step.mark` が `final`）は箱を外し（`.main-step.is-final`）、タスク見出し行にラベルを載せる。
 * ラベルを出すのは `finalLabel` が立っているとき（中間レポートのあるやり取りか、本文に `task` があるときだけ。どちらも無ければ「最終」が何も区別しない）。
 *
 * 中間レポートは全部 `<details>`（`FoldedStep`）にして、利用者が1行に畳めるようにする。既定は開いている。
 * `<section>` で描くのは最終レポートと、どちらでもないステップだけ。
 */
function Step(props: StepProps): ReactElement | undefined {
  const { step } = props
  if (step.body.kind !== "text") {
    return undefined
  }
  if (isInterimStep(step)) {
    return (
      <FoldedStep
        step={step}
        turnId={props.turnId}
        hasInterimReport={props.hasInterimReport}
        phoneHidden
      />
    )
  }
  return (
    <section
      className={stepClassName(step)}
      {...{ [REPORT_STEP_ATTRIBUTE]: step.mark === "final" ? REPORT_STEP_FINAL_VALUE : "" }}
    >
      <StepReport
        step={step}
        turnId={props.turnId}
        reveal={props.reveal}
        latest={props.latest}
        hasInterimReport={props.hasInterimReport}
        folded={false}
        phoneHidden={false}
      />
    </section>
  )
}

/** ステップの器に付ける class。最終レポートは箱を外す（`is-final`）。中間レポートの箱は `FoldedStep` が持つ。 */
function stepClassName(step: MainViewStep): string {
  return clsx(styles["main-step"], step.mark === "final" && styles["is-final"])
}

/**
 * 演出を掛ける候補のステップ（最終レポート＝確定したレポートを持つ最後のステップ）。
 * 中間レポートは流れている最中に少しずつ出る本文なので、ここでは選ばない。
 * 選び方そのものは `markFinalReport` が済ませてある。
 */
function finalReportStep(turn: MainViewTurn): MainViewStep | undefined {
  return turn.steps.find((step) => step.mark === "final")
}
