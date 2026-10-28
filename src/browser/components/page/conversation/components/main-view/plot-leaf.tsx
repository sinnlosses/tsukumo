// `Plot`（図の申告）を Markdown に戻さず直接描く。形は `plotDrawingOf` が決め、表に落ちる形は `Table` と同じ描き方にする。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import { plotRows } from "../../../../../../shared/report/figure-grammar.ts"
import { plotDrawingOf, type PlotDrawing } from "../../../../../../shared/report/plot-drawing.ts"
import { chartConfigOf } from "../../../../../../shared/report/report-diagram-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { FigureFence } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"
import { TableFigure } from "./table-leaf.tsx"

export function PlotLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Plot") {
    return <></>
  }
  const plot = { ...part, kind: "plot" } as const
  const figure = plotFigureOf(plotDrawingOf(plot))
  const rows = plotRows(plot).map((row) => [...row])
  return figure === undefined ? (
    <TableFigure
      part={{
        id: part.id,
        component: "Table",
        title: part.question,
        columns: part.data.map((column) => column.name),
        rows,
        rest: "",
        fold: part.fold,
        aside: part.aside,
      }}
      value={value}
      rowOrder={rows.map((_, index) => index)}
    />
  ) : (
    <FoldedLeafFrame value={value} title={figure.title} fit={false} fold={part.fold} swap={false}>
      <FigureFence language={figure.language} spec={figure.spec} />
    </FoldedLeafFrame>
  )
}

type PlotFigure = {
  readonly title: string
  readonly language: "chart" | "number-line" | "bullet" | "scatter" | "histogram"
  readonly spec: string
}

/** 図になる形のフェンスの言語と中身。表に落ちる形は図を持たない。 */
function plotFigureOf(drawing: PlotDrawing): PlotFigure | undefined {
  switch (drawing.kind) {
    case "table":
      return undefined
    case "chart":
      return {
        title: drawing.chart.title,
        language: "chart",
        spec: JSON.stringify(chartConfigOf(drawing.chart, { values: true })),
      }
    case "gauge":
      return {
        title: drawing.gauge.title,
        language: drawing.gauge.kind === "bullet" ? "bullet" : "number-line",
        spec: JSON.stringify(drawing.gauge),
      }
    case "scatter":
      return {
        title: drawing.scatter.title,
        language: "scatter",
        spec: JSON.stringify(drawing.scatter),
      }
    case "histogram":
      return {
        title: drawing.histogram.title,
        language: "histogram",
        spec: JSON.stringify(drawing.histogram),
      }
  }
}
