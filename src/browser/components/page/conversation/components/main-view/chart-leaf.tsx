// `Chart`（数の推移・割合のグラフ）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { A2uiReportPart } from "../../../../../../shared/report/a2ui-report-outline.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { FAILED_VALUE_TEXT } from "../../../../../../shared/report/report-static-component-list.ts"
import { chartConfigOf } from "../../domain/report-diagram-markdown.ts"
import { FigureFence } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

export function ChartLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Chart") {
    return <></>
  }
  const spec = JSON.stringify(chartConfigOf({ ...part, kind: "chart" }))
  return (
    <FoldedLeafFrame value={value} title={part.title} fit={false} fold={part.fold} swap={false}>
      <FigureFence language="chart" spec={spec} />
    </FoldedLeafFrame>
  )
}

/** 振った値で値の欄に誤りが出た `Chart`・`ChartGrid`。題と枠は残し、図の代わりに「—」を描く。 */
export function FailedChartLeaf(props: {
  readonly part: A2uiReportPart<"Chart" | "ChartGrid">
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  return (
    <FoldedLeafFrame value={value} title={part.title} fit={false} fold={part.fold} swap={false}>
      <p data-chart-failed="">{FAILED_VALUE_TEXT}</p>
    </FoldedLeafFrame>
  )
}
