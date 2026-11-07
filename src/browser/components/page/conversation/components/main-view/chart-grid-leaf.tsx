// `ChartGrid`（目盛りを揃えた小さな図の格子）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { FigureFence, InlineCodeText } from "../../../../../features/report/markdown.tsx"
import { chartGridConfigsOf } from "../../../../../features/report/report-diagram-markdown.ts"
import styles from "./main-view.module.css"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

export function ChartGridLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "ChartGrid") {
    return <></>
  }
  const panels = chartGridConfigsOf({ ...part, kind: "chartGrid" })
  return (
    <FoldedLeafFrame value={value} title={part.title} fit={false} fold={part.fold} swap={false}>
      <div className={styles["chart-grid"]} data-chart-grid={String(panels.length)}>
        {panels.map((panel, index) => (
          <figure key={`${String(index)}:${panel.heading}`} className={styles["chart-grid-panel"]}>
            <figcaption className={styles["chart-grid-heading"]}>
              <InlineCodeText text={panel.heading} />
            </figcaption>
            <FigureFence language="chart" spec={JSON.stringify(panel.config)} />
          </figure>
        ))}
      </div>
    </FoldedLeafFrame>
  )
}
