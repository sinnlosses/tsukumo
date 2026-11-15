// 1ステップぶんのレポート本文。欄の並びを根の中に並べる。
// 部品の一覧（`a2ui` の版）を持つ本文は、A2UI の面で描く（`A2uiReport`）。根の `Report` が無い記録は、頭とお願いだけを値から描く。

import type { ReactElement, RefCallback } from "react"

import type { MainViewReportBody } from "../../../shared/session/main-view-shape.ts"
import { A2uiReport } from "./a2ui-surface.tsx"
import { MarkdownReport, ReportFrame } from "./leaf/body-region.tsx"
import { FavorMarkContext, type FavorMark } from "./leaf/checks-verdict.tsx"
import { FavorFollowUp } from "./leaf/favor-follow-up.tsx"
import type { NextStepsOrigin } from "./leaf/next-step-row.tsx"
import { HeadRegion } from "./leaf/report-head-region.tsx"

export { PhaseTimeSummary } from "./leaf/phase-time-section.tsx"

type ReportProps = {
  readonly body: MainViewReportBody
  /** 書き上げていくように見せるか。見るのはマウントした時点の値だけ。 */
  readonly reveal: boolean
  /** この本文が載っているやり取り（`MainViewTurn.id`）。配る筆先に添える。 */
  readonly turnId: number
  /** 置く側が足す class(狭い画面で隠すなど)。 */
  readonly className: string
  /** 書き上げの演出が付けるポンの class。 */
  readonly revealClassName: string
  /** 本文の根に重ねて付ける class。 */
  readonly blockClassName: string
  readonly nextSteps?: NextStepsOrigin
  /** 冒頭にお願いの印を出すか。無指定は出す。 */
  readonly favorMark?: FavorMark
  /** お願いの欄が付く・外れるときに呼ばれる。無指定は何もしない。 */
  readonly favorRef?: RefCallback<HTMLElement>
  /** この本文を書いた `report` の呼び出しの id。渡すと節の中の内容部品が「聞く」で指せる。 */
  readonly reportToolUseId?: string
}

export function Report(props: ReportProps): ReactElement {
  return (
    <FavorMarkContext value={props.favorMark ?? "inline"}>
      <ReportBody {...props} />
    </FavorMarkContext>
  )
}

function ReportBody(props: ReportProps): ReactElement {
  const { body } = props
  if (body.kind === "markdown") {
    return (
      <MarkdownReport
        markdown={body.markdown}
        reveal={props.reveal}
        turnId={props.turnId}
        className={props.className}
        revealClassName={props.revealClassName}
        blockClassName={props.blockClassName}
      />
    )
  }
  if (body.a2ui.kind === "surface") {
    return (
      <A2uiReport
        body={body}
        view={body.a2ui}
        reveal={props.reveal}
        turnId={props.turnId}
        className={props.className}
        revealClassName={props.revealClassName}
        blockClassName={props.blockClassName}
        nextSteps={props.nextSteps}
        favorRef={props.favorRef}
        reportToolUseId={props.reportToolUseId}
      />
    )
  }
  return (
    <ReportFrame
      reveal={props.reveal}
      turnId={props.turnId}
      className={props.className}
      revealClassName={props.revealClassName}
      blockClassName={props.blockClassName}
    >
      <HeadRegion head={body.a2ui.head} />
      <FavorFollowUp
        favor={body.a2ui.favor}
        components={[]}
        checks={body.a2ui.head.checks}
        favorRef={props.favorRef}
        nextSteps={props.nextSteps}
      />
    </ReportFrame>
  )
}
