// 1つのやり取り。ステップの並び（レポート・質問の記録）の後ろに、やり取りで1つの補足メッセージの欄を置いて縦に1本で積む（番号は振らない）。
// 最終レポートのある閉じたやり取りは、最終レポート → 経過の畳み（中間レポートと質問の記録、末尾に補足メッセージの欄）の順にする（`arrangeTurn`）。
// ツールの実行は描かない（進行は帯の「いまの作業」が持つ）。
// 失敗で終わったやり取りは、頭に失敗の表示を出す（色だけでなく字で成功と見分ける）。

import clsx from "clsx"
import { use, useState, type ReactElement } from "react"

import type { ReportTask } from "../../../../../../shared/report/report-task.ts"
import {
  isInterimStep,
  type MainViewAction,
  type MainViewStep,
  type MainViewStepBody,
  type MainViewTurn,
} from "../../../../../../shared/session/main-view-shape.ts"
import { formatMeasured } from "../../../../../../shared/utils/elapsed-time.ts"
import { AskThreadContext } from "../../../../../features/report/ask-thread-context.ts"
import { ReplyPortContext } from "../../../../../features/report/reply-port.ts"
import { Report } from "../../../../../features/report/report.tsx"
import { useExternalSync } from "../../../../../hooks/use-external-sync.ts"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import { useDraftedReports } from "../../stores/drafted-report.ts"
import { AsideThread } from "./aside-thread.tsx"
import { revealStepIdOf } from "./domain/draft-reveal.ts"
import { REPORT_STEP_ATTRIBUTE } from "./domain/outline-report-head.ts"
import { arrangeTurn, progressFoldSummary, type ProgressEntry } from "./domain/turn-arrangement.ts"
import { DraftReport } from "./draft-report.tsx"
import { ExpandableHead } from "./expandable-head.tsx"
import { useReplyPort } from "./hooks/use-reply-port.ts"
import styles from "./main-view.module.css"
import { QuestionRecord } from "./question-record.tsx"
import { ReportHead, type ReportLabel } from "./report-head.tsx"
import { TurnFailureBlock } from "./turn-failure-block.tsx"

type TurnProps = {
  readonly turn: MainViewTurn
  /** 今回（いちばん新しい）のやり取りか。演出を掛けてよいのは今回だけで、過去のターンでは本文が最初から全部出ている。 */
  readonly newest: boolean
  /** 出し始めた時点で既にある最終レポートも、まだ読まれていないものとして演出するか（地図から入れ替えたばかりのレポート）。 */
  readonly freshReport: boolean
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
  // 草稿は確定版がステップに出た時点で外れ、この部品も中身の切り替えで作り直されるので、描いたことは部品の外の store に書く。
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
  const askSlot = use(AskThreadContext)
  const arrangement =
    askSlot.kind === "grouped" ? arrangeTurn(turn, askSlot.remaining) : arrangeTurn(turn)
  const latestStepId = props.newest ? finalStep?.id : undefined
  const port = useReplyPort()

  return (
    <ReplyPortContext value={{ kind: "open", port }}>
      <div>
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
        {(turn.steps.length > 0 || turn.drafts.length > 0 || turn.failure.kind === "failed") && (
          <VStack
            element="div"
            name={{ kind: "none" }}
            gap="md"
            align="stretch"
            justify="start"
            wrap="nowrap"
            className=""
          >
            {turn.failure.kind === "failed" && (
              <TurnFailureBlock
                failure={turn.failure.failure}
                requestText={turn.request?.text ?? ""}
                newest={props.newest}
              />
            )}
            {/* `key` は配列の添字ではなく `step.id`（`MainViewStep.id`。古いステップを落とす前に振った通し番号）を使う。
              添字だと、古いステップが落ちて残りの添字が1つずつ前へずれた瞬間に React が別のステップの DOM を使い回してしまい、`<details>` の `open` のような制御されていない DOM の状態が別のステップへ乗り移って見える。 */}
            {arrangement.kind === "arrival" &&
              turn.steps.map((step) => (
                <Step
                  step={step}
                  turnId={turn.id}
                  reveal={step.id === revealStepId}
                  latest={step.id === latestStepId}
                  hasInterimReport={turn.hasInterimReport}
                  showQuestions
                  key={step.id}
                />
              ))}
            {arrangement.kind === "final-first" && (
              <>
                <Step
                  step={arrangement.final}
                  turnId={turn.id}
                  reveal={arrangement.final.id === revealStepId}
                  latest={arrangement.final.id === latestStepId}
                  hasInterimReport={turn.hasInterimReport}
                  showQuestions={false}
                  key={arrangement.final.id}
                />
                {arrangement.progress.length > 0 && (
                  <ProgressFold
                    progress={arrangement.progress}
                    turnId={turn.id}
                    hasInterimReport={turn.hasInterimReport}
                    newest={props.newest}
                  />
                )}
              </>
            )}
            {/* `key` を `toolUseId` にするので、書いている途中の部品から記録の部品へ移っても面を作り直さない。 */}
            {turn.drafts.map((draft, index) => (
              <DraftReport
                draft={draft}
                turnId={turn.id}
                waiting={index === turn.drafts.length - 1}
                key={`draft:${draft.toolUseId}`}
              />
            ))}
            {arrangement.kind === "arrival" && arrangement.asides.length > 0 && (
              <AsideThread asides={arrangement.asides} newest={props.newest} />
            )}
          </VStack>
        )}
      </div>
    </ReplyPortContext>
  )
}

/** `Report` が本文の根に重ねる class（ポンの演出と、ステップ末尾の余白の打ち消しが指す綴り）。 */
const REPORT_CLASS_NAMES = {
  revealClassName: styles["draft-pop"],
  blockClassName: styles["detail-block"],
}

type StepProps = {
  readonly step: MainViewStep
  /** このステップが載っているやり取り（`<Report>` から筆先へ渡る）。 */
  readonly turnId: number
  readonly reveal: boolean
  /** いちばん新しいやり取りの最後のレポートか。末尾に次の一手の行を出す。 */
  readonly latest: boolean
  /** このステップが載っているやり取りに中間レポートがあるか（`MainViewTurn.hasInterimReport`）。 */
  readonly hasInterimReport: boolean
  /** このステップの質問の記録を札のそばに出すか。経過の畳みに入れるやり取りの最終のステップでは出さない。 */
  readonly showQuestions: boolean
}

/**
 * 1ステップ分。札（レポートと質問の記録）。無ければ何も描かない（`null`）。
 *
 * ツールの実行（`action.kind === "tool"`）は描かない。
 * `actions` にはツールの記録も残っているが、メインビューに出すのは質問の記録だけ。
 */
function Step(props: StepProps): ReactElement | undefined {
  const { step } = props
  const hasCard =
    step.body.kind === "text" || (props.showQuestions && step.actions.some(isQuestion))

  if (!hasCard) {
    return undefined
  }

  return <StepCard {...props} />
}

/**
 * ステップの本文と質問の記録の札。
 *
 * 中間レポート（`step.mark` が `interim-kept` か `interim-folded`）は話が途中の本文なので、タスク見出し行にラベルを載せて地と枠を変える（`.main-step.is-interim`）。
 *
 * 最終レポート（`step.mark` が `final`）は箱を外し（`.main-step.is-final`）、タスク見出し行にラベルを載せる。
 * ラベルを出すのは `finalLabel` が立っているとき（中間レポートのあるやり取りか、本文に `task` があるときだけ。どちらも無ければ「最終」が何も区別しない）。
 *
 * 後ろに別のレポートが現れた中間レポート（`interim-folded`）は、何件も開いたまま積まれると見通しが悪いので畳む。
 * 畳んだ分は `<details>` にして、開いたときに初めて中身を描き、開いたあとは閉じても DOM に残す。まだ追い越されていない最後の中間レポートは開いた `<section>` のまま。
 * 畳むのは本文だけで、質問の記録は畳みの外に出す。
 */
function StepCard(props: StepProps): ReactElement {
  const { step } = props
  const questions = props.showQuestions ? step.actions.filter(isQuestion) : []
  const questionCards = questions.map((question) => (
    <QuestionRecord entry={question} key={question.toolUseId} />
  ))

  if (step.mark !== "interim-folded") {
    return (
      <section
        className={clsx(
          stepClassName(step),
          isInterimStep(step) && questions.length === 0 && styles["phone-hidden"],
        )}
        {...{ [REPORT_STEP_ATTRIBUTE]: step.body.kind === "text" ? "" : undefined }}
      >
        <StepReport
          step={step}
          turnId={props.turnId}
          reveal={props.reveal}
          latest={props.latest}
          hasInterimReport={props.hasInterimReport}
          folded={false}
          phoneHidden={isInterimStep(step)}
        />
        {questionCards}
      </section>
    )
  }

  return (
    <>
      <FoldedStep
        step={step}
        turnId={props.turnId}
        hasInterimReport={props.hasInterimReport}
        phoneHidden
      />
      {questionCards}
    </>
  )
}

type FoldedStepProps = {
  readonly step: MainViewStep
  readonly turnId: number
  readonly hasInterimReport: boolean
  readonly phoneHidden: boolean
}

/** 中間レポートを `<summary>` の1行に畳んだ形。質問の記録は持たない（呼ぶ側が畳みの外に出す）。 */
function FoldedStep(props: FoldedStepProps): ReactElement {
  const [opened, setOpened] = useState(false)
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setOpened(true)
        }
      }}
      className={clsx(
        styles["main-step"],
        styles["is-interim"],
        props.phoneHidden && styles["phone-hidden"],
      )}
    >
      <Text
        element="summary"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["step-heading"]}
      >
        {interimSummary(props.step.body)}
      </Text>
      {opened && (
        <StepReport
          step={props.step}
          turnId={props.turnId}
          reveal={false}
          latest={false}
          hasInterimReport={props.hasInterimReport}
          folded
          phoneHidden={props.phoneHidden}
        />
      )}
    </details>
  )
}

type StepReportProps = {
  readonly step: MainViewStep
  readonly turnId: number
  readonly reveal: boolean
  readonly latest: boolean
  readonly hasInterimReport: boolean
  readonly folded: boolean
  /** 狭い画面で本文を隠すか。隠すのは本文の側だけで、質問の記録は残す。 */
  readonly phoneHidden: boolean
}

function StepReport(props: StepReportProps): ReactElement | undefined {
  const { step } = props
  if (step.body.kind !== "text") {
    return undefined
  }
  const phoneHidden = props.phoneHidden ? styles["phone-hidden"] : ""
  const label = reportLabel(step, step.body.task, props.hasInterimReport, props.folded)
  const head = (
    <ReportHead
      label={label}
      task={step.body.task}
      phase={step.body.finishedPhase}
      className={phoneHidden}
    />
  )
  return (
    <>
      {label === "final" && !props.phoneHidden ? (
        <ExpandableHead
          body={step.body}
          turnId={props.turnId}
          head={head}
          reportClassNames={REPORT_CLASS_NAMES}
        />
      ) : (
        head
      )}
      <Report
        body={step.body.report}
        reveal={props.reveal}
        turnId={props.turnId}
        className={phoneHidden}
        reportToolUseId={step.origin.kind === "tool-report" ? step.origin.toolUseId : undefined}
        nextSteps={
          props.latest && !props.phoneHidden
            ? {
                sessionRemaining: step.body.sessionRemaining ?? { kind: "unrecorded" },
                ...(step.body.task.kind === "task" ? { outcome: step.body.task.outcome } : {}),
              }
            : undefined
        }
        {...REPORT_CLASS_NAMES}
      />
    </>
  )
}

type ProgressFoldProps = {
  readonly progress: readonly ProgressEntry[]
  readonly turnId: number
  readonly hasInterimReport: boolean
  readonly newest: boolean
}

/**
 * 経過の畳み。中間レポート（1行の畳みの形）と質問の記録を届いた順に入れ、補足メッセージの欄を末尾に置く。
 */
function ProgressFold(props: ProgressFoldProps): ReactElement {
  return (
    <details className={styles["progress-fold"]}>
      <Text element="summary" size="label" tone="ink-quiet" weight="inherit" className="">
        {progressFoldSummary(props.progress)}
      </Text>
      <VStack
        element="div"
        name={{ kind: "none" }}
        gap="md"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["progress-fold-steps"]}
      >
        {props.progress.map((entry) => {
          switch (entry.kind) {
            case "interim":
              return (
                <FoldedStep
                  step={entry.step}
                  turnId={props.turnId}
                  hasInterimReport={props.hasInterimReport}
                  phoneHidden={false}
                  key={`interim:${String(entry.step.id)}`}
                />
              )
            case "question":
              return (
                <QuestionRecord entry={entry.entry} key={`question:${entry.entry.toolUseId}`} />
              )
            case "asides":
              return <AsideThread asides={entry.asides} newest={props.newest} key="asides" />
          }
        })}
      </VStack>
    </details>
  )
}

/**
 * タスク見出し行の頭に置くラベル。
 * 畳んだ中間レポートは `<summary>` がラベルを持つので置かない。
 * 最終レポートのラベルは、中間レポートのあるやり取りか、`task` があるときだけ。
 */
function reportLabel(
  step: MainViewStep,
  task: ReportTask,
  hasInterimReport: boolean,
  folded: boolean,
): ReportLabel {
  if (isInterimStep(step)) {
    return folded ? "none" : "interim"
  }
  return step.mark === "final" && (hasInterimReport || task.kind === "task") ? "final" : "none"
}

/** ステップの器に付ける class。器の形（`is-interim` の破線の箱 / `is-final` の箱なし）は互いに立たない。 */
function stepClassName(step: MainViewStep): string {
  return clsx(
    styles["main-step"],
    isInterimStep(step) && styles["is-interim"],
    step.mark === "final" && styles["is-final"],
  )
}

/**
 * 演出を掛ける候補のステップ（最終レポート＝確定したレポートを持つ最後のステップ）。
 * 中間レポートは流れている最中に少しずつ出る本文なので、ここでは選ばない。
 * 選び方そのものは `markFinalReport` が済ませてある。
 */
function finalReportStep(turn: MainViewTurn): MainViewStep | undefined {
  return turn.steps.find((step) => step.mark === "final")
}

/** 畳んだ中間レポートの `<summary>` に出す文字列。先頭行が無ければラベルだけ。 */
function interimSummary(body: MainViewStepBody): string {
  if (body.kind === "none" || body.firstLine === "") {
    return "中間レポート"
  }
  const time =
    body.finishedPhase.kind === "phase"
      ? `${body.finishedPhase.skipped ? " · 飛ばした" : ""} · 所要 ${formatMeasured(body.finishedPhase.duration)}`
      : ""
  return `中間レポート: ${body.firstLine}${time}`
}

function isQuestion(
  action: MainViewAction,
): action is Extract<MainViewAction, { kind: "question" }> {
  return action.kind === "question"
}
