// `report` の本文の節と塊の合併と、その検証。

import { z } from "zod"

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
  dimensionBlockSchema,
  graphBlockSchema,
  imageBlockSchema,
  mermaidBlockSchema,
  svgBlockSchema,
} from "./report-block-diagram.ts"
import type { DeepReadonly } from "./report-block-field.ts"
import {
  codeBlockSchema,
  filesBlockSchema,
  listBlockSchema,
  markdownBlockSchema,
  noteBlockSchema,
  progressBlockSchema,
  textBlockSchema,
} from "./report-block-prose.ts"
import { MAX_HEADING } from "./report-limit.ts"
import { type RecordedReportShapeTag, REPORT_SHAPE_TAGS } from "./report-shape-tag.ts"

// `report` の schema で `figure` と `sections` が共有する塊。名前を外すと両方に複製され、ツール定義が約1万字増える
const namedBeforeAfter = beforeAfterBlockSchema.meta({ id: "BeforeAfterBlock" })
const namedDimension = dimensionBlockSchema.meta({ id: "DimensionBlock" })
const namedStats = statsBlockSchema.meta({ id: "StatsBlock" })
const namedMermaid = mermaidBlockSchema.meta({ id: "MermaidBlock" })
const namedGraph = graphBlockSchema.meta({ id: "GraphBlock" })
const namedChart = chartBlockSchema.meta({ id: "ChartBlock" })
const namedSvg = svgBlockSchema.meta({ id: "SvgBlock" })
const namedImage = imageBlockSchema.meta({ id: "ImageBlock" })

export const reportBlockSchema = z.discriminatedUnion("kind", [
  textBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  matrixBlockSchema,
  compareBlockSchema,
  namedBeforeAfter,
  namedDimension,
  noteBlockSchema,
  namedStats,
  codeBlockSchema,
  namedMermaid,
  namedGraph,
  namedChart,
  namedSvg,
  progressBlockSchema,
  optionsBlockSchema,
  namedImage,
  filesBlockSchema,
  markdownBlockSchema,
])

export type ReportBlock = DeepReadonly<z.infer<typeof reportBlockSchema>>

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

/** `report` の `figure` に図を置かない理由。 */
export const REPORT_FIGURE_NONE_REASONS = [
  "short-answer",
  "no-shape",
  "single-value",
  "no-material",
] as const

/** `report` の `figure`（レポートの図1つか、置かない理由）。図の塊は `sections` の同じ種類の塊と同じ形。 */
export const reportFigureSchema = z.discriminatedUnion("kind", [
  namedImage,
  namedMermaid,
  namedGraph,
  namedSvg,
  namedBeforeAfter,
  namedChart,
  namedStats,
  namedDimension,
  z.object({ kind: z.literal("none"), reason: z.enum(REPORT_FIGURE_NONE_REASONS) }),
])

export type ReportFigure = DeepReadonly<z.infer<typeof reportFigureSchema>>

/**
 * 読み戻した `figure`。`unrecorded` は `figure` の欄が無かったころの呼び出しと形の崩れで、
 * 書き手には出さない（{@link reportFigureSchema} の理由には入れない）。
 */
export type RecordedReportFigure =
  | ReportFigure
  | { readonly kind: "none"; readonly reason: "unrecorded" }

export type RecordedFigureNoneReason = Extract<
  RecordedReportFigure,
  { readonly kind: "none" }
>["reason"]

/**
 * `figure` の図を見出しの無い先頭の節にした、描く順（figure → sections）の並び。`none` なら `sections` のまま。
 * 図の番号と、図の不具合の位置（何個目か）はこの並びで数える。
 */
export function sectionsWithFigure(
  figure: RecordedReportFigure,
  sections: readonly ReportSection[],
): readonly ReportSection[] {
  return figure.kind === "none"
    ? sections
    : [{ heading: "", shapeTag: "unspecified", blocks: [figure] }, ...sections]
}

export const reportSectionSchema = z.object({
  heading: z
    .string()
    .default("")
    .describe(
      `その節の結論を言う語（「変更点」「まとめ」のようなどのレポートにも当てはまる語にしない）。${String(MAX_HEADING)}字以内で、疑問文にしない。節が1つなら省いてよく、2つ以上なら全部に付ける`,
    ),
  shapeTag: z
    .enum(REPORT_SHAPE_TAGS)
    .optional()
    .describe(
      "その節が表す内容の形（形の札）。節の要点を1文にし、上から問いを当てて最初に当たった札にする: 1. 要素は1つか → single / 2. 要素の間に向きのある関係があるか → cause・connection・position・state（状態の移り）・time・order / 3. 数が主役か → quantity / 4. 候補を採否するか、2つの側を比べるか → choice・comparison・boundary（どこまでが対象か） / 5. 項目が2つ以上の属性を持つか → attribute・mapping（どれがどこへ） / 6. どれでもない → parallel",
    ),
  blocks: z.array(reportBlockSchema).min(1),
})

/** 読み戻した節。札を省いた節は `unspecified`。 */
export type ReportSection = {
  readonly heading: string
  readonly shapeTag: RecordedReportShapeTag
  readonly blocks: readonly ReportBlock[]
}

/**
 * 文字列の本文（`sections` に切り替える前の `report` の `body`）を節に畳む。空白だけなら節は無く、それ以外は見出しの無い節1つに
 * 逃げ道の塊1つ。頭の空行と末尾の空白は落とす（描いた見た目は変わらず、送り直しの判定で空白の差を見ないため）。
 */
export function reportSectionsOfBody(body: string): readonly ReportSection[] {
  const markdown = body.replace(/^(?:[ \t]*\n)+/, "").trimEnd()
  return markdown === ""
    ? []
    : [
        {
          heading: "",
          shapeTag: "unspecified",
          blocks: [{ kind: "markdown", markdown, fold: "", aside: "" }],
        },
      ]
}

/**
 * `reportBlockSchema` が知っている塊の種類。`reportBlockSchema` の枝から導き、塊を1種類足して
 * ここへ書き忘れる経路を型で塞ぐ（列挙し直すと `satisfies` は部分集合しか検査しない）。
 */
export const REPORT_BLOCK_KINDS: readonly ReportBlock["kind"][] = reportBlockSchema.options.map(
  (option) => option.shape.kind.value,
)

export type ParsedReportSections = {
  readonly sections: readonly ReportSection[]
  /** 知らない種類（{@link REPORT_BLOCK_KINDS} に無い `kind`）で落とした塊の数。 */
  readonly unknownBlockCount: number
}

/**
 * `report` の引数の `sections` を取り出す。塊ごとに検証し、崩れた塊と知らない種類の塊は落とす
 * （塊1つの読み損ねでレポートを捨てない）。塊が残らない節と、配列でない値は無いものとする。
 */
export function parseReportSections(value: unknown): ParsedReportSections {
  const sections = z.array(z.unknown()).safeParse(value)
  if (!sections.success) {
    return { sections: [], unknownBlockCount: 0 }
  }
  const parsed = sections.data.flatMap((candidate) => {
    const section = looseSectionSchema.safeParse(candidate)
    return section.success ? [section.data] : []
  })
  return {
    sections: parsed.flatMap(({ heading, shapeTag, blocks }) => {
      const valid = blocks.flatMap((block) => {
        const parsedBlock = reportBlockSchema.safeParse(block)
        return parsedBlock.success ? [parsedBlock.data] : []
      })
      return valid.length === 0 ? [] : [{ heading, shapeTag, blocks: valid }]
    }),
    unknownBlockCount: parsed.flatMap(({ blocks }) => blocks).filter(isUnknownKindBlock).length,
  }
}

/** `report` の引数の `figure` を取り出す。無い・崩れたものは `unrecorded` に畳む。 */
export function parseReportFigure(value: unknown): RecordedReportFigure {
  const figure = reportFigureSchema.safeParse(value)
  return figure.success ? figure.data : { kind: "none", reason: "unrecorded" }
}

/** 塊を1つずつ検証するために、節の見出しと札だけを先に読む形。札が無い・列挙の外なら `unspecified`。 */
const looseSectionSchema = z.object({
  heading: reportSectionSchema.shape.heading,
  shapeTag: z.union([z.enum(REPORT_SHAPE_TAGS), z.literal("unspecified")]).catch("unspecified"),
  blocks: z.array(z.unknown()),
})

const blockKindSchema = z.object({ kind: z.string() })

function isUnknownKindBlock(block: unknown): boolean {
  const kind = blockKindSchema.safeParse(block)
  return kind.success && !REPORT_BLOCK_KINDS.some((known) => known === kind.data.kind)
}
