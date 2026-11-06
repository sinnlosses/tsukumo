// `report` の内容部品の合併と、その検証。

import { z } from "zod"

import { plotBlockSchema } from "./figure-grammar.ts"
import {
  compareBlockSchema,
  matrixBlockSchema,
  optionsBlockSchema,
  pointsCompareBlockSchema,
  statsBlockSchema,
  tableBlockSchema,
} from "./report-block-comparison.ts"
import {
  chartBlockSchema,
  chartGridBlockSchema,
  graphBlockSchema,
  imageBlockSchema,
  mermaidBlockSchema,
  svgBlockSchema,
} from "./report-block-diagram.ts"
import type { DeepReadonly } from "./report-block-field.ts"
import {
  claimsBlockSchema,
  codeBlockSchema,
  descriptionListBlockSchema,
  filesBlockSchema,
  listBlockSchema,
  markdownBlockSchema,
  noteBlockSchema,
  quoteBlockSchema,
  textBlockSchema,
} from "./report-block-prose.ts"
import { timelineBlockSchema } from "./timeline-block.ts"
import { traceBlockSchema } from "./trace-block.ts"

// ツール定義の中で `retrospective.blocks` の合併に入る部品の、定義上の名前
const namedStats = statsBlockSchema.meta({ id: "StatsBlock" })
const namedMermaid = mermaidBlockSchema.meta({ id: "MermaidBlock" })
const namedGraph = graphBlockSchema.meta({ id: "GraphBlock" })
const namedChart = chartBlockSchema.meta({ id: "ChartBlock" })
const namedChartGrid = chartGridBlockSchema.meta({ id: "ChartGridBlock" })
const namedSvg = svgBlockSchema.meta({ id: "SvgBlock" })
const namedImage = imageBlockSchema.meta({ id: "ImageBlock" })
const namedTimeline = timelineBlockSchema.meta({ id: "TimelineBlock" })
const namedPlot = plotBlockSchema.meta({ id: "PlotBlock" })

const writerBlockBranches = [
  textBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  matrixBlockSchema,
  compareBlockSchema,
  noteBlockSchema,
  namedStats,
  codeBlockSchema,
  namedMermaid,
  namedGraph,
  namedChart,
  namedChartGrid,
  namedSvg,
  namedTimeline,
  optionsBlockSchema,
  claimsBlockSchema,
  quoteBlockSchema,
  descriptionListBlockSchema,
  traceBlockSchema,
  namedImage,
  namedPlot,
  markdownBlockSchema,
] as const

const writerBlockSchema = z.discriminatedUnion("kind", writerBlockBranches)

// 読み戻し用。書き手には渡さない `files` の部品（旧い記録に残る）も通す
const leafComponentSchema = z.discriminatedUnion("kind", [...writerBlockBranches, filesBlockSchema])

export type LeafComponent = DeepReadonly<z.infer<typeof leafComponentSchema>>

// `retrospective.blocks` の要素になる、書き手向けの部品の合併
export const namedWriterBlockSchema = writerBlockSchema.meta({ id: "LeafComponent" })

/** 画面に描く節。見出し（空なら描かない）と内容部品の並び。 */
export type ReportSection = {
  readonly heading: string
  readonly blocks: readonly LeafComponent[]
}

/** 部品の配列を1つずつ検証し、崩れた部品と知らない種類の部品は落とす。配列でない値は空。 */
export function parseLeafComponents(value: unknown): readonly LeafComponent[] {
  const candidates = z.array(z.unknown()).safeParse(value)
  return candidates.success
    ? candidates.data.flatMap((block) => {
        const parsedBlock = leafComponentSchema.safeParse(block)
        return parsedBlock.success ? [parsedBlock.data] : []
      })
    : []
}

/** レポートの外（質問の添え書き）で図として使える部品。 */
export const figureBlockSchema = z.discriminatedUnion("kind", [
  listBlockSchema,
  tableBlockSchema,
  pointsCompareBlockSchema,
  mermaidBlockSchema,
  graphBlockSchema,
  codeBlockSchema,
  imageBlockSchema,
])

export type FigureBlock = DeepReadonly<z.infer<typeof figureBlockSchema>>
