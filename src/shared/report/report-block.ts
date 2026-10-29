// `report` の葉の塊の合併と、その検証。

import { z } from "zod"

import { plotBlockSchema } from "./figure-grammar.ts"
import {
  compareBlockSchema,
  matrixBlockSchema,
  optionsBlockSchema,
  statsBlockSchema,
  tableBlockSchema,
} from "./report-block-comparison.ts"
import {
  beforeAfterBlockSchema,
  chartBlockSchema,
  graphBlockSchema,
  imageBlockSchema,
  mermaidBlockSchema,
  svgBlockSchema,
} from "./report-block-diagram.ts"
import type { DeepReadonly } from "./report-block-field.ts"
import {
  claimsBlockSchema,
  codeBlockSchema,
  filesBlockSchema,
  listBlockSchema,
  markdownBlockSchema,
  noteBlockSchema,
  quoteBlockSchema,
  textBlockSchema,
} from "./report-block-prose.ts"
import { timelineBlockSchema } from "./timeline-block.ts"

// ツール定義の中で `retrospective.blocks` の合併に入る塊の、定義上の名前
const namedBeforeAfter = beforeAfterBlockSchema.meta({ id: "BeforeAfterBlock" })
const namedStats = statsBlockSchema.meta({ id: "StatsBlock" })
const namedMermaid = mermaidBlockSchema.meta({ id: "MermaidBlock" })
const namedGraph = graphBlockSchema.meta({ id: "GraphBlock" })
const namedChart = chartBlockSchema.meta({ id: "ChartBlock" })
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
  namedBeforeAfter,
  noteBlockSchema,
  namedStats,
  codeBlockSchema,
  namedMermaid,
  namedGraph,
  namedChart,
  namedSvg,
  namedTimeline,
  optionsBlockSchema,
  claimsBlockSchema,
  quoteBlockSchema,
  namedImage,
  namedPlot,
  markdownBlockSchema,
] as const

const writerBlockSchema = z.discriminatedUnion("kind", writerBlockBranches)

// 読み戻し用。書き手には渡さない `files` の塊（旧い記録に残る）も通す
const reportBlockSchema = z.discriminatedUnion("kind", [...writerBlockBranches, filesBlockSchema])

export type ReportBlock = DeepReadonly<z.infer<typeof reportBlockSchema>>

// `retrospective.blocks` の要素になる、書き手向けの塊の合併
export const namedWriterBlockSchema = writerBlockSchema.meta({ id: "ReportBlock" })

/**
 * 使われ方の記録の `blockKinds` に現れうる塊の種類。読み戻しの合併の枝から導き、旧い記録だけにある
 * `row`・`panel` を足す。塊を1種類足してここへ書き忘れる経路を型で塞ぐ。
 */
export const REPORT_BLOCK_KINDS: readonly string[] = [
  ...reportBlockSchema.options.map((option) => option.shape.kind.value),
  "row",
  "panel",
]

/** 画面に描く節。見出し（空なら描かない）と葉の塊の並び。 */
export type ReportBlockSection = {
  readonly heading: string
  readonly blocks: readonly ReportBlock[]
}

/** 塊の配列を1つずつ検証し、崩れた塊と知らない種類の塊は落とす。配列でない値は空。 */
export function parseReportBlocks(value: unknown): readonly ReportBlock[] {
  const candidates = z.array(z.unknown()).safeParse(value)
  return candidates.success
    ? candidates.data.flatMap((block) => {
        const parsedBlock = reportBlockSchema.safeParse(block)
        return parsedBlock.success ? [parsedBlock.data] : []
      })
    : []
}

/** レポートの外（質問の添え書き）で図として使える塊。 */
export const figureBlockSchema = z.discriminatedUnion("kind", [
  listBlockSchema,
  tableBlockSchema,
  compareBlockSchema,
  mermaidBlockSchema,
  graphBlockSchema,
  codeBlockSchema,
  imageBlockSchema,
])

export type FigureBlock = DeepReadonly<z.infer<typeof figureBlockSchema>>
