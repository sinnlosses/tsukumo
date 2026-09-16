// 1つのやり取り（依頼 → ステップの並び）。`<RequestHeading>` + ステップの並び
// （レポート・質問の記録）を縦に1本で積む（`docs/requirements.md` 4.2
// 「ステップは縦に1本で積む」。番号は振らない）。**ツールの実行は描かない**
// （`docs/requirements.md` 4.2「メインビュー」。2026-09-16 決定。進行はサイドバーが持つ）。

import { Fragment, type ReactElement } from "react"

import {
  type MainViewAction,
  type MainViewStep,
  type MainViewTurn,
} from "../../protocol/main-view.ts"
import { QuestionRecord } from "./question-record.tsx"
import { Report } from "./report.tsx"

export type TurnProps = {
  readonly turn: MainViewTurn
}

export function Turn(props: TurnProps): ReactElement {
  const { turn } = props

  return (
    <div>
      {turn.request !== undefined && <RequestHeading request={turn.request} />}
      {turn.droppedCount > 0 && (
        <p className="turn-dropped">これ以前の {turn.droppedCount} 件は省略した</p>
      )}
      {turn.steps.length > 0 && (
        <div className="main-steps">
          {/* `key` は配列の添字ではなく `step.id`（`limitTurnEntries` が古いステップを落とす前に
              振った通し番号）を使う。添字だと、古いステップが落ちて残りの添字が1つずつ前へ
              ずれた瞬間に React が別のステップの DOM を使い回してしまい、`<details>` の `open`
              のような制御されていない DOM の状態が別のステップへ乗り移って見える
              （2026-09-16 の指摘。`src/protocol/main-view.ts` の `MainViewStep.id` を参照）。 */}
          {turn.steps.map((step) => (
            <Step step={step} key={step.id} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 1ステップ分。レポートも質問の記録も無いステップは何も描かない（`null`）。
 *
 * **ツールの実行（`action.kind === "tool"`）は描かない。** `actions` にはツールの記録も
 * 残っているが（`keepOnlyInterimReports` などが「そのステップにツール呼び出しが続いたか」の
 * 材料に使う。`MainViewStep.actions` はそのために残す）、メインビューに出すのは質問の記録だけ。
 *
 * **中間レポート（`step.interim`）は見分けが付く形で描く。** 話が途中の本文なので、
 * 小さなラベルを載せて地と枠を変える（`.main-step.is-interim`。判定そのものは
 * `src/protocol/main-view.ts` が済ませてある）。
 *
 * **後ろに別のレポートが現れた中間レポート（`step.superseded`）は畳む。** 何件も開いたまま
 * 積まれると見通しが悪いため（2026-09-16 の指摘）。畳んだ分は `<details>` にするだけで
 * 中身は DOM に残す（記録からは消さない）。まだ追い越されていない最後の中間レポートは
 * 今までどおり開いた `<section>` のまま。
 */
function Step(props: { readonly step: MainViewStep }): ReactElement | null {
  const { step } = props
  const questions = props.step.actions.filter(isQuestion)

  if (step.report === undefined && questions.length === 0) {
    return null
  }

  const body = (
    <>
      {step.report !== undefined && <Report markdown={step.report} />}
      {questions.map((question, index) => (
        <QuestionRecord entry={question} key={index} />
      ))}
    </>
  )

  if (step.interim && step.superseded) {
    return (
      <details className="main-step is-interim">
        <summary className="step-heading">{interimSummary(step.firstLine)}</summary>
        {body}
      </details>
    )
  }

  return (
    <section className={step.interim ? "main-step is-interim" : "main-step"}>
      {step.interim && <p className="step-heading">中間レポート</p>}
      {body}
    </section>
  )
}

/** 畳んだ中間レポートの `<summary>` に出す文字列。先頭行が無ければラベルだけ。 */
function interimSummary(firstLine: string | undefined): string {
  return firstLine === undefined || firstLine === "" ? "中間レポート" : `中間レポート: ${firstLine}`
}

function isQuestion(
  action: MainViewAction,
): action is Extract<MainViewAction, { kind: "question" }> {
  return action.kind === "question"
}

// 見出しに出す依頼の全文の長さの上限。無いと際限なく長い依頼で DOM が育ち続ける。
const MAX_REQUEST_HEADING_TEXT_LENGTH = 2000

function truncateRequestText(request: string): string {
  return request.length <= MAX_REQUEST_HEADING_TEXT_LENGTH
    ? request
    : `${request.slice(0, MAX_REQUEST_HEADING_TEXT_LENGTH)}…`
}

/**
 * 依頼の見出し。**全行を既定で見せる**（ユーザーの指摘 2026-09-12「複数行の依頼が1行しか
 * 出ない」）。
 *
 * - **1行の依頼は `<h2>` のまま。** 畳む先が無いのに開閉の三角を出さない
 * - **複数行の依頼は `<details open>`。** 既定で開いているので全行が読め、読み終わったら
 *   閉じて1行目だけにできる。**`<summary>` に1行目、中の `<div>` には2行目以降**を入れて
 *   1行目が二重に出ないようにする
 */
function RequestHeading(props: { readonly request: string }): ReactElement {
  const text = truncateRequestText(props.request)
  const lineBreak = text.indexOf("\n")

  if (lineBreak === -1) {
    return <h2 className="turn-request">{text}</h2>
  }

  const firstLine = text.slice(0, lineBreak)
  const rest = text.slice(lineBreak + 1)

  return (
    <details className="turn-request" open>
      <summary>{firstLine}</summary>
      <div className="turn-request-full">
        {rest.split("\n").map((line, index) => (
          <Fragment key={index}>
            {index > 0 && <br />}
            {line}
          </Fragment>
        ))}
      </div>
    </details>
  )
}
