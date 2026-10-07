// 1つのやり取り。`<RequestImages>` + 脇の話の欄 + ステップの並び（レポート・質問の記録）を縦に1本で積む（番号は振らない）。
// ツールの実行は描かない（進行は帯の「いまの作業」が持つ）。
// 失敗で終わったやり取りは、頭に失敗の塊を出す（色だけでなく字で成功と見分ける）。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import type { ReportTask } from "../../../../../../../../shared/report/report-task.ts"
import type {
  MainViewAction,
  MainViewRequest,
  MainViewStep,
  MainViewStepBody,
  MainViewTurn,
} from "../../../../../../../../shared/session/main-view.ts"
import { formatMeasured } from "../../../../../../../../shared/utils/elapsed-time.ts"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import { PromptImageThumbnails } from "../../../prompt-image/prompt-image.tsx"
import mainViewStyles from "../../main-view.module.css"
import { AsideThread } from "../aside-thread/aside-thread.tsx"
import { QuestionRecord } from "../question-record/question-record.tsx"
import { ReportHead, type ReportLabel } from "../report-head/report-head.tsx"
import { Report } from "../report/report.tsx"
import { TurnFailureBlock } from "../turn-failure-block/turn-failure-block.tsx"
import styles from "./turn.module.css"

export type TurnProps = {
  readonly turn: MainViewTurn
  /** 今回（いちばん新しい）のやり取りか。演出を掛けてよいのは今回だけで、過去のターンでは本文が最初から全部出ている。 */
  readonly newest: boolean
  /** 出し始めた時点で既にある最終レポートも、まだ読まれていないものとして演出するか（地図から入れ替えたばかりのレポート）。 */
  readonly freshReport: boolean
}

export function Turn(props: TurnProps): ReactElement {
  const { turn } = props
  const writingStepId = finalReportStepId(turn)
  // このやり取りを出し始めた時点で既にあった本文は演出しない。
  // 過去のターンを開いたとき・ページを読み込み直したときは「確定済みの本文が一度も書かれない」ので、あとから現れた本文だけが対象になる。
  // この初期値がやり取りごとに取り直されるのは、`<MainView>` がやり取りの番号を `key` に渡すため。
  const [stepIdAtMount] = useState(props.freshReport ? undefined : writingStepId)
  const revealStepId = props.newest && writingStepId !== stepIdAtMount ? writingStepId : undefined

  return (
    <div>
      {turn.request !== undefined && <RequestImages request={turn.request} />}
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
      {turn.asides.length > 0 && <AsideThread asides={turn.asides} newest={props.newest} />}
      {(turn.steps.length > 0 || turn.failure.kind === "failed") && (
        <VStack
          element="div"
          name={{ kind: "none" }}
          ref={undefined}
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
          {turn.steps.map((step) => (
            <Step
              step={step}
              turnId={turn.id}
              reveal={step.id === revealStepId}
              hasInterimReport={turn.hasInterimReport}
              key={step.id}
            />
          ))}
        </VStack>
      )}
    </div>
  )
}

type StepProps = {
  readonly step: MainViewStep
  /** このステップが載っているやり取り（`<Report>` から筆先へ渡る）。 */
  readonly turnId: number
  readonly reveal: boolean
  /** このステップが載っているやり取りに中間レポートがあるか（`MainViewTurn.hasInterimReport`）。 */
  readonly hasInterimReport: boolean
}

/**
 * 1ステップ分。札（レポートと質問の記録）。無ければ何も描かない（`null`）。
 *
 * ツールの実行（`action.kind === "tool"`）は描かない。
 * `actions` にはツールの記録も残っているが、メインビューに出すのは質問の記録だけ。
 */
function Step(props: StepProps): ReactElement | null {
  const { step } = props
  const hasCard = step.body.kind === "text" || step.actions.some(isQuestion)

  if (!hasCard) {
    return null
  }

  return <StepCard {...props} />
}

/**
 * ステップの本文と質問の記録の札。
 *
 * 中間レポート（`step.interim`）は話が途中の本文なので、目録の1行にラベルを載せて地と枠を変える（`.main-step.is-interim`）。
 *
 * 最終レポート（`step.final`）は箱を外し（`.main-step.is-final`）、目録の1行にラベルを載せる。
 * ラベルを出すのは `finalLabel` が立っているとき（中間レポートのあるやり取りか、本文に `task` があるときだけ。どちらも無ければ「最終」が何も区別しない）。
 *
 * 後ろに別のレポートが現れた中間レポート（`step.superseded`）は、何件も開いたまま積まれると見通しが悪いので畳む。
 * 畳んだ分は `<details>` にするだけで中身は DOM に残す。まだ追い越されていない最後の中間レポートは開いた `<section>` のまま。
 * 畳むのは本文だけで、質問の記録は畳みの外に出す。
 */
function StepCard(props: StepProps): ReactElement {
  const { step } = props
  const questions = step.actions.filter(isQuestion)
  const folded = step.interim && step.superseded
  const questionCards = questions.map((question, index) => (
    <QuestionRecord entry={question} key={index} />
  ))
  const report = step.body.kind === "text" && (
    <>
      <ReportHead
        label={reportLabel(step, step.body.task, props.hasInterimReport, folded)}
        task={step.body.task}
        phase={step.body.finishedPhase}
      />
      <Report markdown={step.body.report} reveal={props.reveal} turnId={props.turnId} />
    </>
  )

  if (!folded) {
    return (
      <section className={stepClassName(step)}>
        {report}
        {questionCards}
      </section>
    )
  }

  return (
    <>
      <details className={clsx(mainViewStyles["main-step"], mainViewStyles["is-interim"])}>
        <Text
          element="summary"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["step-heading"]}
        >
          {interimSummary(step.body)}
        </Text>
        {report}
      </details>
      {questionCards}
    </>
  )
}

/**
 * 目録の1行の頭に置くラベル。
 * 畳んだ中間レポートは `<summary>` がラベルを持つので置かない。
 * 最終レポートのラベルは、中間レポートのあるやり取りか、`task` があるときだけ。
 */
function reportLabel(
  step: MainViewStep,
  task: ReportTask,
  hasInterimReport: boolean,
  folded: boolean,
): ReportLabel {
  if (step.interim) {
    return folded ? "none" : "interim"
  }
  return step.final && (hasInterimReport || task.kind === "task") ? "final" : "none"
}

/** ステップの器に付ける class。器の形（`is-interim` の破線の箱 / `is-final` の箱なし）は互いに立たない。 */
function stepClassName(step: MainViewStep): string {
  return clsx(
    mainViewStyles["main-step"],
    step.interim && mainViewStyles["is-interim"],
    !step.interim && step.final && mainViewStyles["is-final"],
  )
}

/**
 * 演出を掛ける候補のステップ（最終レポート＝確定したレポートを持つ最後のステップ）。
 * 中間レポートは流れている最中に少しずつ出る本文なので、ここでは選ばない。
 * 選び方そのものは `markFinalReport` が済ませてある。
 */
function finalReportStepId(turn: MainViewTurn): number | undefined {
  return turn.steps.find((step) => step.final)?.id
}

/** 畳んだ中間レポートの `<summary>` に出す文字列。先頭行が無ければラベルだけ。 */
function interimSummary(body: MainViewStepBody): string {
  if (body.kind === "none" || body.firstLine === "") {
    return "中間レポート"
  }
  const time =
    body.finishedPhase.kind === "phase"
      ? ` · 所要 ${formatMeasured(body.finishedPhase.duration)}`
      : ""
  return `中間レポート: ${body.firstLine}${time}`
}

function isQuestion(
  action: MainViewAction,
): action is Extract<MainViewAction, { kind: "question" }> {
  return action.kind === "question"
}

/** 添えた画像の控え（添えていなければ何も出ない）。依頼の文面は札の頭が出す。 */
function RequestImages(props: { readonly request: MainViewRequest }): ReactElement {
  return <PromptImageThumbnails images={props.request.images} size="full" />
}
