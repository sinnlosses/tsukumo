// フェンスの言語（mermaid・chart・number-line・bullet・scatter・histogram）から、図・グラフの部品を選ぶ。

import type { ReactElement } from "react"

import { ChartBlock } from "./chart-block.tsx"
import { GaugeBlock } from "./gauge-block.tsx"
import { HistogramBlock } from "./histogram-block.tsx"
import { MermaidBlock } from "./mermaid-block.tsx"
import { ScatterBlock } from "./scatter-block.tsx"

const FENCE_FIGURE_LANGUAGES = [
  "mermaid",
  "chart",
  "number-line",
  "bullet",
  "scatter",
  "histogram",
] as const

export type FenceFigureLanguage = (typeof FENCE_FIGURE_LANGUAGES)[number]

/** 図・グラフのフェンスの言語か。 */
export function isFenceFigureLanguage(
  language: string | undefined,
): language is FenceFigureLanguage {
  return FENCE_FIGURE_LANGUAGES.some((name) => name === language)
}

/** `spec` はフェンスの中身（mermaid はソース、それ以外は JSON）。 */
export function FenceFigure(props: {
  readonly language: FenceFigureLanguage
  readonly spec: string
}): ReactElement {
  switch (props.language) {
    case "mermaid":
      return <MermaidBlock key={props.spec} code={props.spec} />
    case "chart":
      return <ChartBlock spec={props.spec} />
    case "number-line":
    case "bullet":
      return <GaugeBlock spec={props.spec} />
    case "scatter":
      return <ScatterBlock spec={props.spec} />
    case "histogram":
      return <HistogramBlock spec={props.spec} />
  }
}
