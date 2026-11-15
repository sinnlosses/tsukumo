// 面の末尾のお願いと次の一手の行。次の一手があるのは最新のやり取りの最終レポートだけで、そのときだけ札を押せる。

import type { ReactElement, RefCallback } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportChecksView } from "../../../../shared/report/report-check-view.ts"
import { favorOptionsOf } from "../domain/favor-option-list.ts"
import { NextStepRow, type NextStepsOrigin } from "./next-step-row.tsx"
import { FavorRegion } from "./report-head-region.tsx"

export function FavorFollowUp(props: {
  readonly favor: { readonly id: string; readonly text: string }
  readonly components: readonly A2uiReportComponent[]
  readonly checks: ReportChecksView
  readonly favorRef?: RefCallback<HTMLElement>
  readonly nextSteps?: NextStepsOrigin
}): ReactElement {
  return (
    <>
      <FavorRegion
        id={props.favor.id}
        text={props.favor.text}
        favorRef={props.favorRef}
        options={favorOptionsOf(props.components)}
        pressable={props.nextSteps !== undefined}
      />
      {props.nextSteps !== undefined && (
        <NextStepRow origin={props.nextSteps} components={props.components} checks={props.checks} />
      )}
    </>
  )
}
