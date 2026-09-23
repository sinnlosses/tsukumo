// 1つのやり取り（依頼の続き → ステップの並び）。`<RequestRest>` + ステップの並び
// （レポート・質問の記録）を縦に1本で積む（`docs/display.md` 4.2
// 「ステップは縦に1本で積む」。番号は振らない）。**ツールの実行は描かない**
// （`docs/display.md` 4.2「メインビュー」。進行は帯の「いまの作業」が持つ。
// `docs/screen-design.md` 13.9）。**失敗で終わったやり取りは、末尾に「失敗で終わった」と理由を
// 出す**（`docs/display.md` 4.2「メインビュー」。色だけでなく字で成功と見分ける）。

import { Fragment, useState, type ReactElement } from "react"

import {
  type MainViewAction,
  type MainViewRequest,
  type MainViewStep,
  type MainViewStepBody,
  type MainViewTurn,
} from "../../../shared/main-view.ts"
import { type TurnFailure } from "../../../shared/turn-failure.ts"
import { PromptImageThumbnails } from "../../components/prompt-image.tsx"
import { turnFailureLabel } from "../../domain/api-error-label.ts"
import { requestLinesAfterTitle } from "./domain/turn-title.ts"
import styles from "./main-view.module.css"
import { QuestionRecord } from "./question-record.tsx"
import { Report } from "./report.tsx"

export type TurnProps = {
  readonly turn: MainViewTurn
  /**
   * 今回（いちばん新しい）のやり取りか。**演出（`reveal/use-report-reveal.ts`）を掛けてよいのは
   * 今回だけ**で、過去のターンでは本文が最初から全部出ている（`docs/requirements.md` 4.3）。
   */
  readonly newest: boolean
}

export function Turn(props: TurnProps): ReactElement {
  const { turn } = props
  const writingStepId = finalReportStepId(turn)
  // **このやり取りを出し始めた時点で既にあった本文は演出しない。** 過去のターンを開いたとき・
  // ページを読み込み直したときは「確定済みの本文が一度も書かれない」ので、**あとから現れた
  // 本文だけ**が対象になる（`<MainView>` がやり取りの番号を `key` に渡すので、この初期値は
  // やり取りごとに取り直される）。
  const [stepIdAtMount] = useState(writingStepId)
  const revealStepId = props.newest && writingStepId !== stepIdAtMount ? writingStepId : undefined

  return (
    <div>
      {turn.request !== undefined && <RequestRest request={turn.request} />}
      {turn.droppedCount > 0 && (
        <p className={styles["turn-dropped"]}>これ以前の {turn.droppedCount} 件は省略した</p>
      )}
      {(turn.steps.length > 0 || turn.failure.kind === "failed") && (
        <div className={styles["main-steps"]}>
          {/* `key` は配列の添字ではなく `step.id`（`limitTurnEntries` が古いステップを落とす前に
              振った通し番号）を使う。添字だと、古いステップが落ちて残りの添字が1つずつ前へ
              ずれた瞬間に React が別のステップの DOM を使い回してしまい、`<details>` の `open`
              のような制御されていない DOM の状態が別のステップへ乗り移って見える
              （`src/shared/main-view.ts` の `MainViewStep.id` を参照）。 */}
          {turn.steps.map((step) => (
            <Step
              step={step}
              turnId={turn.id}
              reveal={step.id === revealStepId}
              finalLabel={step.final && turn.hasInterimReport}
              key={step.id}
            />
          ))}
          {turn.failure.kind === "failed" && <TurnFailureNotice failure={turn.failure.failure} />}
        </div>
      )}
    </div>
  )
}

/**
 * やり取りの末尾に出す「失敗で終わった」の札。見出しの字が失敗を言い、理由は型の決まった語だけ
 * （`domain/api-error-label.ts`。SDK の自由文は出さない）。枠は `--state-ng`（色だけに頼らない）。
 */
function TurnFailureNotice(props: { readonly failure: TurnFailure }): ReactElement {
  return (
    <section className={`${styles["main-step"]} ${styles["is-failed"]}`} role="note">
      <p className={styles["step-heading"]}>失敗で終わった</p>
      <p className={styles["turn-failure-reason"]}>{turnFailureLabel(props.failure)}</p>
    </section>
  )
}

/**
 * 1ステップ分。レポートも質問の記録も無いステップは何も描かない（`null`）。
 *
 * **ツールの実行（`action.kind === "tool"`）は描かない。** `actions` にはツールの記録も
 * 残っているが、メインビューに出すのは質問の記録だけ。
 *
 * **中間レポート（`step.interim`）は見分けが付く形で描く。** 話が途中の本文なので、
 * 小さなラベルを載せて地と枠を変える（`.main-step.is-interim`。判定そのものは
 * `src/shared/main-view.ts` が済ませてある）。
 *
 * **最終レポート（`step.final`）は地を中間レポートと同じ ground にし（`.main-step.is-final`）、
 * ラベルを載せる。** ラベルを出すのは `finalLabel` が立っているとき——**中間レポートの
 * あるやり取りだけ**で、本文が1つしか無いやり取りでは「最終」が何も区別しない（条件は
 * `src/shared/main-view.ts` の `markFinalReport` が畳んである）。
 *
 * **後ろに別のレポートが現れた中間レポート（`step.superseded`）は畳む。** 何件も開いたまま
 * 積まれると見通しが悪いため。畳んだ分は `<details>` にするだけで
 * 中身は DOM に残す（記録からは消さない）。まだ追い越されていない最後の中間レポートは
 * 今までどおり開いた `<section>` のまま。
 */
function Step(props: {
  readonly step: MainViewStep
  /**
   * このステップが載っているやり取り（`<Report>` から筆先へ渡る。
   * `reveal/use-report-reveal.ts`）。
   */
  readonly turnId: number
  readonly reveal: boolean
  /** 「最終レポート」のラベルを載せるか（`MainViewTurn.hasInterimReport` と `step.final` の組）。 */
  readonly finalLabel: boolean
}): ReactElement | null {
  const { step } = props
  const questions = props.step.actions.filter(isQuestion)

  if (step.body.kind === "none" && questions.length === 0) {
    return null
  }

  const content = (
    <>
      {step.body.kind === "text" && (
        <Report markdown={step.body.report} reveal={props.reveal} turnId={props.turnId} />
      )}
      {questions.map((question, index) => (
        <QuestionRecord entry={question} key={index} />
      ))}
    </>
  )

  if (step.interim && step.superseded) {
    return (
      <details className={`${styles["main-step"]} ${styles["is-interim"]}`}>
        <summary className={styles["step-heading"]}>{interimSummary(step.body)}</summary>
        {content}
      </details>
    )
  }

  return (
    <section className={stepClassName(step)}>
      {step.interim && <p className={styles["step-heading"]}>中間レポート</p>}
      {props.finalLabel && <p className={styles["step-heading"]}>最終レポート</p>}
      {content}
    </section>
  )
}

/**
 * ステップの器に付ける class。地の段（`is-interim` / `is-final`）は互いに立たない。
 * 戻り値に undefined が混じるのは CSS Modules の対応表を引くため（`src/browser/css-module.d.ts`）で、
 * `className` はそのまま受ける。
 */
function stepClassName(step: MainViewStep): string | undefined {
  if (step.interim) {
    return `${styles["main-step"]} ${styles["is-interim"]}`
  }
  return step.final ? `${styles["main-step"]} ${styles["is-final"]}` : styles["main-step"]
}

/**
 * 演出を掛ける候補のステップ（**最終レポート**＝確定したレポートを持つ最後のステップ）。
 * 中間レポートは流れている最中に少しずつ出る本文なので、ここでは選ばない（演出は中間レポートにも
 * 既に出し切った本文にも掛けない）。
 * 選び方そのものは `src/shared/main-view.ts` の `markFinalReport` が済ませてある。
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

// 札に出す依頼の全文の長さの上限。無いと際限なく長い依頼で DOM が育ち続ける。
const MAX_REQUEST_HEADING_TEXT_LENGTH = 2000

function truncateRequestText(request: string): string {
  return request.length <= MAX_REQUEST_HEADING_TEXT_LENGTH
    ? request
    : `${request.slice(0, MAX_REQUEST_HEADING_TEXT_LENGTH)}…`
}

/**
 * 依頼のうち**札の頭のタイトル（`turn-header.tsx`）に出なかったぶん**と、添えた画像の控え
 * （`docs/requirements.md` 4.10。**控えはその下**に並び、添えていなければ何も出ない）。
 *
 * - **1行の依頼は何も出さない。** タイトルと同じ行を二度出さない
 * - **複数行の依頼は2行目以降を `<details open>` で出す。** 既定で開いているので全行が読め、
 *   読み終わったら閉じられる。どの行がタイトルに取られたかは `domain/turn-title.ts` と同じ規則
 */
function RequestRest(props: { readonly request: MainViewRequest }): ReactElement {
  const rest = requestLinesAfterTitle(truncateRequestText(props.request.text))

  return (
    <>
      {rest.length > 0 && (
        <details className={styles["turn-request"]} open>
          <summary>依頼の続き（{String(rest.length)} 行）</summary>
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
