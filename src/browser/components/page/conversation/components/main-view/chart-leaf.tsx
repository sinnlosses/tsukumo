// `Chart`（数の推移・割合のグラフ）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import { chartConfigOf } from "../../../../../../shared/report/report-diagram-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
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
