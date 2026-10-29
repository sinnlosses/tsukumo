// 1ステップぶんのレポート本文。欄の並びを根の中に並べる。
// 部品の一覧（`a2ui` の版）を持つ本文は、A2UI の面で描く（`A2uiReport`）。根の `Report` が無い記録は、頭とお願いだけを値から描く。

import type { ReactElement } from "react"

import type { MainViewReportBody } from "../../../../../../shared/session/main-view-shape.ts"
import { A2uiReport } from "./a2ui-surface.tsx"
import { MarkdownReport, ReportFrame } from "./body-region.tsx"
import { FavorRegion, HeadRegion } from "./report-head-region.tsx"

type ReportProps = {
  readonly body: MainViewReportBody
  /** 書き上げていくように見せるか。見るのはマウントした時点の値だけ。 */
  readonly reveal: boolean
  /** この本文が載っているやり取り（`MainViewTurn.id`）。配る筆先に添える。 */
  readonly turnId: number
  /** 置く側が足す class(狭い画面で隠すなど)。 */
  readonly className: string
}

export function Report(props: ReportProps): ReactElement {
  const { body } = props
  if (body.kind === "markdown") {
    return (
      <MarkdownReport
        markdown={body.markdown}
        reveal={props.reveal}
        turnId={props.turnId}
        className={props.className}
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
      />
    )
  }
  return (
    <ReportFrame reveal={props.reveal} turnId={props.turnId} className={props.className}>
      <HeadRegion head={body.a2ui.head} />
      <FavorRegion id={body.a2ui.favor.id} text={body.a2ui.favor.text} />
    </ReportFrame>
  )
}
