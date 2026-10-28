// `Plot`（図の申告）を Markdown に戻さず直接描く。形は `plotDrawingOf` が決め、図になる形だけをここで描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import { plotDrawingOf, type PlotDrawing } from "../../../../../../shared/report/plot-drawing.ts"
import { chartConfigOf } from "../../../../../../shared/report/report-diagram-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { FigureFence } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

type PlotPart = Extract<A2uiReportComponent, { readonly component: "Plot" }>

/** 部品を塊の形にして、描く形を決める。 */
export function plotDrawingOfPart(part: PlotPart): PlotDrawing {
  return plotDrawingOf({ ...part, kind: "plot" })
}

export function PlotLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Plot") {
    return <></>
  }
  const figure = plotFigureOf(plotDrawingOfPart(part))
  return figure === undefined ? (
    <></>
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
