// 1つのやり取り。`<RequestRest>` + ステップの並び（レポート・質問の記録）を縦に1本で積む（番号は振らない）。
// ツールの実行は描かない（進行は帯の「いまの作業」が持つ）。
// 失敗で終わったやり取りは、末尾に「失敗で終わった」と理由を出す（色だけでなく字で成功と見分ける）。

import clsx from "clsx"
import { Fragment, useState, type ReactElement } from "react"

import type { ReportTask } from "../../../../../../../../shared/report/report-task.ts"
import type { TurnFailure } from "../../../../../../../../shared/session-driver/turn-failure.ts"
import type {
  MainViewAction,
  MainViewRequest,
  MainViewStep,
  MainViewStepBody,
  MainViewTurn,
} from "../../../../../../../../shared/session/main-view.ts"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import { turnFailureLabel } from "../../../../domain/api-error-label.ts"
import { PromptImageThumbnails } from "../../../prompt-image/prompt-image.tsx"
import { requestLinesAfterTitle, truncateRequestText } from "../../domain/turn-title.ts"
import styles from "../../main-view.module.css"
import { QuestionRecord } from "../question-record/question-record.tsx"
import { ReportHead, type ReportLabel } from "../report-head/report-head.tsx"
import { Report } from "../report/report.tsx"

export type TurnProps = {
  readonly turn: MainViewTurn
  /** 今回（いちばん新しい）のやり取りか。演出を掛けてよいのは今回だけで、過去のターンでは本文が最初から全部出ている。 */
  readonly newest: boolean
}

export function Turn(props: TurnProps): ReactElement {
  const { turn } = props
  const writingStepId = finalReportStepId(turn)
  // このやり取りを出し始めた時点で既にあった本文は演出しない。
  // 過去のターンを開いたとき・ページを読み込み直したときは「確定済みの本文が一度も書かれない」ので、あとから現れた本文だけが対象になる。
  // この初期値がやり取りごとに取り直されるのは、`<MainView>` がやり取りの番号を `key` に渡すため。
  const [stepIdAtMount] = useState(writingStepId)
  const revealStepId = props.newest && writingStepId !== stepIdAtMount ? writingStepId : undefined

  return (
    <div>
      {turn.request !== undefined && <RequestRest request={turn.request} />}
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
          {turn.failure.kind === "failed" && <TurnFailureNotice failure={turn.failure.failure} />}
        </VStack>
      )}
    </div>
  )
}

/**
 * やり取りの末尾に出す「失敗で終わった」の札。
 * 見出しの字が失敗を言い、理由は型の決まった語だけ（`turnFailureLabel`。SDK の自由文は出さない）。
 */
function TurnFailureNotice(props: { readonly failure: TurnFailure }): ReactElement {
  return (
    <section className={clsx(styles["main-step"], styles["is-failed"])} role="note">
      <Text
        element="p"
        size="label"
        tone="state-ng"
        weight="inherit"
        className={styles["step-heading"]}
      >
        失敗で終わった
      </Text>
      <Text
        element="p"
        size="inherit"
        tone="inherit"
        weight="inherit"
        className={styles["turn-failure-reason"]}
      >
        {turnFailureLabel(props.failure)}
      </Text>
    </section>
  )
}

/**
 * 1ステップ分。レポートも質問の記録も無いステップは何も描かない（`null`）。
 *
 * ツールの実行（`action.kind === "tool"`）は描かない。
 * `actions` にはツールの記録も残っているが、メインビューに出すのは質問の記録だけ。
 *
 * 中間レポート（`step.interim`）は話が途中の本文なので、目録の1行にラベルを載せて地と枠を変える（`.main-step.is-interim`）。
 *
 * 最終レポート（`step.final`）は地を中間レポートと同じ ground にし（`.main-step.is-final`）、目録の1行にラベルを載せる。
 * ラベルを出すのは `finalLabel` が立っているとき（中間レポートのあるやり取りか、本文に `task` があるときだけ。どちらも無ければ「最終」が何も区別しない）。
 *
 * 後ろに別のレポートが現れた中間レポート（`step.superseded`）は、何件も開いたまま積まれると見通しが悪いので畳む。
 * 畳んだ分は `<details>` にするだけで中身は DOM に残す。まだ追い越されていない最後の中間レポートは開いた `<section>` のまま。
 */
function Step(props: {
  readonly step: MainViewStep
  /** このステップが載っているやり取り（`<Report>` から筆先へ渡る）。 */
  readonly turnId: number
  readonly reveal: boolean
  /** このステップが載っているやり取りに中間レポートがあるか（`MainViewTurn.hasInterimReport`）。 */
  readonly hasInterimReport: boolean
}): ReactElement | null {
  const { step } = props
  const questions = props.step.actions.filter(isQuestion)

  if (step.body.kind === "none" && questions.length === 0) {
    return null
  }

  const folded = step.interim && step.superseded
  const content = (
    <>
      {step.body.kind === "text" && (
        <>
          <ReportHead
            label={reportLabel(step, step.body.task, props.hasInterimReport, folded)}
            task={step.body.task}
          />
          <Report markdown={step.body.report} reveal={props.reveal} turnId={props.turnId} />
        </>
      )}
      {questions.map((question, index) => (
        <QuestionRecord entry={question} key={index} />
      ))}
    </>
  )

  if (folded) {
    return (
      <details className={clsx(styles["main-step"], styles["is-interim"])}>
        <Text
          element="summary"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["step-heading"]}
        >
          {interimSummary(step.body)}
        </Text>
        {content}
      </details>
    )
  }

  return <section className={stepClassName(step)}>{content}</section>
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

/** ステップの器に付ける class。地の段（`is-interim` / `is-final`）は互いに立たない。 */
function stepClassName(step: MainViewStep): string {
  return clsx(
    styles["main-step"],
    step.interim && styles["is-interim"],
    !step.interim && step.final && styles["is-final"],
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
  return body.kind === "none" || body.firstLine === ""
    ? "中間レポート"
    : `中間レポート: ${body.firstLine}`
}

function isQuestion(
  action: MainViewAction,
): action is Extract<MainViewAction, { kind: "question" }> {
  return action.kind === "question"
}

/**
 * 依頼のうち札の頭のタイトルに出なかったぶんと、添えた画像の控え（添えていなければ何も出ない）。
 *
 * - 1行の依頼は何も出さない（タイトルと同じ行を二度出さない）
 * - 複数行の依頼は2行目以降（`requestLinesAfterTitle`）を `<details open>` で出す。既定で開いているので全行が読め、読み終わったら閉じられる
 */
function RequestRest(props: { readonly request: MainViewRequest }): ReactElement {
  const rest = requestLinesAfterTitle(truncateRequestText(props.request.text))

  return (
    <>
      {rest.length > 0 && (
        <details className={styles["turn-request"]} open>
          <Text element="summary" size="secondary" tone="ink-quiet" weight="inherit" className="">
            依頼の続き（{String(rest.length)} 行）
          </Text>
          <div className={styles["turn-request-full"]}>
            {rest.map((line, index) => (
              <Fragment key={index}>
                {index > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </div>
        </details>
      )}
      <PromptImageThumbnails images={props.request.images} />
    </>
  )
}
