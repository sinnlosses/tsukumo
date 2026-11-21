// `report` の部品を A2UI のカタログの部品（`component` の判別子と `id` を持つ props）として定義する。
// 内容部品の props と説明は既存の塊の zod を使い回す。

import { mapValues, omit } from "remeda"
import { z } from "zod"

import { BASIC_PART_DEFS, BASIC_PART_SCHEMAS, BASIC_PARTS } from "./a2ui-basic-part-list.ts"
import { addPlotDataIssues, plotBlockSchema } from "./figure-grammar.ts"
import { partCardNote } from "./part-card-note.ts"
import {
  compareBlockSchema,
  keyFiguresSchema,
  matrixBlockSchema,
  optionsBlockSchema,
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
import { type DeepReadonly, omittable } from "./report-block-field.ts"
import {
  claimsBlockSchema,
  codeBlockSchema,
  descriptionListBlockSchema,
  listBlockSchema,
  markdownBlockSchema,
  noteBlockSchema,
  quoteBlockSchema,
  textBlockSchema,
} from "./report-block-prose.ts"
import { reportCheckSchema } from "./report-check.ts"
import {
  parameterCheckBoxSchema,
  parameterSliderSchema,
  reportDefsSchema,
  writtenChartBlockSchema,
  writtenChartGridBlockSchema,
  writtenStatsBlockSchema,
  writtenTextBlockSchema,
} from "./report-expression-block.ts"
import {
  FIRST_SENTENCE_TARGET,
  FIRST_SENTENCE_TARGET_COMMAS,
  MAX_CONCLUSION_SENTENCES,
  MAX_FIRST_SENTENCE,
  MAX_HEADING,
  MAX_SOURCES,
  MAX_TERMS,
} from "./report-limit.ts"
import { reportRetrospectiveSchema } from "./report-retrospective.ts"
import { reportSourceSchema } from "./report-source.ts"
import { reportTaskSchema } from "./report-task.ts"
import { reportTermSchema } from "./report-term.ts"
import { timelineBlockSchema } from "./timeline-block.ts"
import { traceBlockSchema } from "./trace-block.ts"

/** 部品名と schema。`writerBlockBranches` の 22 種と対応する。 */
const LEAF_COMPONENTS = {
  Paragraph: leafComponent("Paragraph", textBlockSchema),
  ItemList: leafComponent("ItemList", listBlockSchema),
  Table: leafComponent("Table", tableBlockSchema).extend({
    sortable: partCardNote(
      z.boolean().optional(),
      "true で列の見出しを押して並べ替えられる。6 行以上は書かなくても付き、false で打ち消す",
    ),
    filterable: partCardNote(
      z.boolean().optional(),
      "true と filterColumn で、その列の値と件数のバッジ（2〜6 種類）が出て押すと絞れる",
    ),
    filterColumn: partCardNote(
      z.number().int().min(0).optional(),
      "絞り込みで見る列の位置（0 始まり）。省略すると全列でバッジは出ない",
    ),
  }),
  Matrix: leafComponent("Matrix", matrixBlockSchema),
  Compare: leafComponent("Compare", compareBlockSchema),
  Note: leafComponent("Note", noteBlockSchema),
  Stats: leafComponent("Stats", statsBlockSchema),
  Code: leafComponent("Code", codeBlockSchema),
  Mermaid: leafComponent("Mermaid", mermaidBlockSchema),
  Graph: leafComponent("Graph", graphBlockSchema),
  Chart: leafComponent("Chart", chartBlockSchema),
  ChartGrid: leafComponent("ChartGrid", chartGridBlockSchema),
  Svg: leafComponent("Svg", svgBlockSchema),
  Timeline: leafComponent("Timeline", timelineBlockSchema),
  Options: leafComponent("Options", optionsBlockSchema),
  Claims: leafComponent("Claims", claimsBlockSchema),
  Quote: leafComponent("Quote", quoteBlockSchema),
  DescriptionList: leafComponent("DescriptionList", descriptionListBlockSchema),
  Trace: leafComponent("Trace", traceBlockSchema),
  Picture: leafComponent("Picture", imageBlockSchema),
  // leafComponent は塊ぜんたいに掛かる検査（superRefine）を写さないので、Plot の data の検査はここで掛け直す
  Plot: leafComponent("Plot", plotBlockSchema).superRefine(addPlotDataIssues),
  Markdown: leafComponent("Markdown", markdownBlockSchema),
} as const

/** 内容部品名と、写す先の塊の `kind`。 */
export const LEAF_COMPONENT_KINDS = {
  Paragraph: textBlockSchema.shape.kind.value,
  ItemList: listBlockSchema.shape.kind.value,
  Table: tableBlockSchema.shape.kind.value,
  Matrix: matrixBlockSchema.shape.kind.value,
  Compare: compareBlockSchema.shape.kind.value,
  Note: noteBlockSchema.shape.kind.value,
  Stats: statsBlockSchema.shape.kind.value,
  Code: codeBlockSchema.shape.kind.value,
  Mermaid: mermaidBlockSchema.shape.kind.value,
  Graph: graphBlockSchema.shape.kind.value,
  Chart: chartBlockSchema.shape.kind.value,
  ChartGrid: chartGridBlockSchema.shape.kind.value,
  Svg: svgBlockSchema.shape.kind.value,
  Timeline: timelineBlockSchema.shape.kind.value,
  Options: optionsBlockSchema.shape.kind.value,
  Claims: claimsBlockSchema.shape.kind.value,
  Quote: quoteBlockSchema.shape.kind.value,
  DescriptionList: descriptionListBlockSchema.shape.kind.value,
  Trace: traceBlockSchema.shape.kind.value,
  Picture: imageBlockSchema.shape.kind.value,
  Plot: plotBlockSchema.shape.kind.value,
  Markdown: markdownBlockSchema.shape.kind.value,
} as const satisfies Record<keyof typeof LEAF_COMPONENTS, string>

/** 書き手に渡す塊の `kind`（内容部品の写し先）の一覧。 */
export const LEAF_COMPONENT_KIND_LIST: readonly string[] = Object.values(LEAF_COMPONENT_KINDS)

/** `Report.figureNone` に置ける、図を置かない理由。 */
export const REPORT_FIGURE_NONE_REASONS = [
  "short-answer",
  "no-shape",
  "single-value",
  "no-material",
] as const

/** 図の内容部品（レポートの図1つか、置かない理由）。図の内容部品は節の同じ種類の内容部品と同じ形。 */
export const reportFigureSchema = z.discriminatedUnion("kind", [
  imageBlockSchema,
  mermaidBlockSchema,
  graphBlockSchema,
  svgBlockSchema,
  timelineBlockSchema,
  compareBlockSchema,
  chartBlockSchema,
  statsBlockSchema,
  plotBlockSchema,
  z.object({ kind: z.literal("none"), reason: z.enum(REPORT_FIGURE_NONE_REASONS) }),
])

type ReportFigure = DeepReadonly<z.infer<typeof reportFigureSchema>>

/**
 * 読み戻した図。`unrecorded` は図を省いた呼び出し・欄が無かったころの呼び出し・形の崩れで、
 * 書き手には出さない（{@link reportFigureSchema} の理由には入れない）。
 */
export type RecordedReportFigure =
  | ReportFigure
  | { readonly kind: "none"; readonly reason: "unrecorded" }

/** 旧い引数の `figure` を取り出す。省いた・崩れたものは `unrecorded` の `none`（図なし）に畳む。 */
export function parseReportFigure(value: unknown): RecordedReportFigure {
  const figure = reportFigureSchema.safeParse(value)
  return figure.success ? figure.data : { kind: "none", reason: "unrecorded" }
}

const FIGURE_KINDS: readonly string[] = reportFigureSchema.options.map(
  (option) => option.shape.kind.value,
)

/** `Report.figure` に置ける内容部品名。 */
export const FIGURE_COMPONENTS: readonly string[] = Object.entries(LEAF_COMPONENT_KINDS)
  .filter(([, kind]) => FIGURE_KINDS.includes(kind))
  .map(([component]) => component)

const speechSchema = z.object({ text: z.string(), expression: z.string() })

/** 節。`children` は内容部品と配置の部品の ID。 */
const sectionComponentSchema = z.object({
  id: z.string(),
  component: z.literal("Section"),
  heading: partCardNote(
    omittable(z.string(), "").describe(
      `セクションの結論を言う語（${String(MAX_HEADING)}字以内・疑問文にしない）。2つ以上なら全部に付ける`,
    ),
    "「変更点」「まとめ」のようなどのレポートにも当てはまる語にしない。セクションが1つなら省いてよい",
  ),
  children: z.array(z.string()).min(1),
})

/** コンテナの幅で段に折り返す格子。列の数は描く側がコンテナの幅から決めるので、書き手は子だけを渡す。 */
const gridComponentSchema = z.object({
  id: z.string(),
  component: z.literal("Grid"),
  children: partCardNote(
    z
      .array(z.string())
      .min(2)
      .describe("同格の部品の ID を2つ以上。横に並び、狭いコンテナでは段に折り返す"),
    "向くのは数のカード・短い表・図。長い段落とコードは格子の外に置く。全幅に出したい部品は格子の外。列の数は書かない",
  ),
})

/** お願いの選択肢1つ。`draft` は押すと入力欄へそのまま入る。 */
export const favorOptionSchema = z.object({
  name: z.string(),
  draft: z.string().describe("利用者がそのまま送る依頼の文（「〜して」の形）"),
  result: z.string().optional(),
  recommended: z.boolean().optional(),
  irreversible: z.boolean().optional(),
})

/** 書き手が勧める次の一手1つ。入力欄の頭の次の一手の並びに札として出る。 */
const nextStepSuggestionSchema = z.object({
  name: z.string().describe("札の頭に小さく出す種類の語（4〜8字）"),
  draft: z.string().describe("押すと入力欄に入る、利用者がそのまま送る依頼の文（「〜して」の形）"),
})

/** 根。`children` は `Section` の ID、`figure` は図の部品の ID。 */
const reportComponentSchema = z.object({
  id: z.string(),
  component: z.literal("Report"),
  task: reportTaskSchema.optional(),
  workPlanClosing: z.enum(["finished", "stopped"]).optional(),
  conclusion: partCardNote(
    z
      .array(z.string())
      .optional()
      .describe(
        `結論。1要素1文で1〜${String(MAX_CONCLUSION_SENTENCES)}要素。1文目は全角${String(MAX_FIRST_SENTENCE)}字以内（目安は${String(FIRST_SENTENCE_TARGET)}字、読点は${String(FIRST_SENTENCE_TARGET_COMMAS)}つまで）で、変更の列挙でなく読み手から見た変化を書く`,
      ),
    `悪い例: 「設定の読み込みを共通化し、型を整理し、テストも足して、起動の流れを書き換えた」（変更の列挙）。良い例: 「次から設定の書き間違いが起動時に分かる」（読み手から見た変化）。2文目は「それで何が良いか」か「変えていないもの」。例: ["…分かる。", "読み方は変えていない。"]`,
  ),
  keyFigures: keyFiguresSchema.optional(),
  workDone: partCardNote(z.string().optional(), "task時のしたこと1段落"),
  notDone: z.array(z.string()).optional(),
  figure: z.string().optional(),
  figureNone: z.enum(REPORT_FIGURE_NONE_REASONS).optional(),
  children: z.array(z.string()).min(1),
  retrospective: reportRetrospectiveSchema
    .extend({
      blocks: partCardNote(
        z.array(z.string()).optional(),
        "結果の根拠に図・表・コードが要るときだけ。部品の ID",
      ),
    })
    .optional(),
  favor: z.string().optional(),
  favorOptions: z.array(favorOptionSchema).max(3).optional(),
  checks: z.array(reportCheckSchema).optional(),
  sources: z.array(reportSourceSchema).min(1).max(MAX_SOURCES).optional(),
  terms: z.array(reportTermSchema).min(1).max(MAX_TERMS).optional(),
  title: z.string().optional(),
  sessionSummary: z.string().optional(),
  sessionRemaining: z.string().optional(),
  continueRequest: z.string().optional(),
  nextSteps: z.array(nextStepSuggestionSchema).max(3).optional(),
  closing: speechSchema.optional(),
  waitingLine: speechSchema.optional(),
})

/** 書き手が書く根。静的な一覧の根に、名前つきの式 `defs` を足した形。 */
const writtenReportComponentSchema = reportComponentSchema.extend({ defs: reportDefsSchema })

/** 書き手が書く内容部品。式を結べる 4 部品だけ、静的な一覧の形と違う。 */
const WRITTEN_LEAF_COMPONENTS = {
  ...LEAF_COMPONENTS,
  Paragraph: leafComponent("Paragraph", writtenTextBlockSchema),
  Stats: leafComponent("Stats", writtenStatsBlockSchema),
  Chart: leafComponent("Chart", writtenChartBlockSchema),
  ChartGrid: leafComponent("ChartGrid", writtenChartGridBlockSchema),
} as const

const OWN_COMPONENT_SCHEMAS = {
  Report: writtenReportComponentSchema,
  Section: sectionComponentSchema,
  ...WRITTEN_LEAF_COMPONENTS,
  Grid: gridComponentSchema,
  ParameterSlider: parameterSliderSchema,
  ParameterCheckBox: parameterCheckBoxSchema,
} as const

/**
 * 書き手に見せる基本の部品。`Row`・`Column`・`Card`・`Divider`・`ChoicePicker` は
 * `Grid`・`Section`・`Table` の絞り込みで足りるので外し、`Tabs` だけ残す（読み戻しは {@link a2uiWrittenComponentSchema} が基本の 6 部品を全部受ける）。
 */
const WRITTEN_BASIC_PART_SCHEMAS = { Tabs: BASIC_PART_SCHEMAS.Tabs } as const

/** 部品名と書き手が書く形。根・節・格子・内容部品 22 種・つまみ 2 種・`Tabs` の 28。 */
export const REPORT_COMPONENT_SCHEMAS = {
  ...OWN_COMPONENT_SCHEMAS,
  ...WRITTEN_BASIC_PART_SCHEMAS,
} as const

/**
 * 静的な一覧（式を初期値で評価した後）の部品 1 つの受理の形。
 * 式もつまみも持たず、塊の形は今のまま（基本の 6 部品を含め 31 部品のどれか）。
 * 受け口で静的にする前の、書き手が書いた形は {@link REPORT_COMPONENT_SCHEMAS}。
 */
export const a2uiReportComponentSchema = z.discriminatedUnion("component", [
  reportComponentSchema,
  sectionComponentSchema,
  gridComponentSchema,
  ...Object.values(LEAF_COMPONENTS),
  ...Object.values(BASIC_PART_SCHEMAS),
])

export type A2uiReportComponent = z.infer<typeof a2uiReportComponentSchema>

/**
 * 書いた部品 1 つを読む形（式・つまみ・`defs` を持つ）。記録済みの呼び出しの読み戻しが通す。
 * 記録済みの `components` は外す前の `Row`・`Column`・`Card`・`Divider`・`ChoicePicker` を持つので、基本の 6 部品を全部受ける。
 * 書き手の受理を狭くするのは {@link REPORT_COMPONENT_SCHEMAS}（`report` ツールの入力）と構造の検査。
 * 初期値で評価した静的な一覧にする前の形で、{@link a2uiReportComponentSchema} はその後の形。
 */
export const a2uiWrittenComponentSchema = z.discriminatedUnion("component", [
  writtenReportComponentSchema,
  sectionComponentSchema,
  gridComponentSchema,
  ...Object.values(WRITTEN_LEAF_COMPONENTS),
  parameterSliderSchema,
  parameterCheckBoxSchema,
  ...Object.values(BASIC_PART_SCHEMAS),
])

export type A2uiWrittenComponent = z.infer<typeof a2uiWrittenComponentSchema>

const CATALOG_ID = "https://tsukumo.example/catalogs/report/v1"

/** AI に渡し、`Catalog.fromJson` に読ませるカタログ文書（自作分は zod から出し、基本の 6 部品は読み戻しのため定数）。 */
export function buildReportCatalogDocument() {
  const schemas = mapValues(OWN_COMPONENT_SCHEMAS, (schema) =>
    z.toJSONSchema(schema, { io: "input" }),
  )
  return {
    catalogId: CATALOG_ID,
    $defs: { ...BASIC_PART_DEFS, ...hoistedDefs(Object.entries(schemas)) },
    components: {
      ...mapValues(schemas, (schema) => omit(schema, ["$schema", "$defs"])),
      ...BASIC_PARTS,
    },
  }
}

/** 部品ごとの JSON Schema が持つ `$defs` を文書の `$defs` に集める。同じ名前で中身が違えば投げる。 */
function hoistedDefs(
  schemas: readonly (readonly [string, z.core.JSONSchema.BaseSchema])[],
): Record<string, unknown> {
  const hoisted = new Map<string, unknown>()
  for (const [component, schema] of schemas) {
    for (const [name, definition] of Object.entries(schema.$defs ?? {})) {
      const existing = hoisted.get(name)
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(definition)) {
        throw new Error(`${component} の $defs ${name} が、ほかの部品の同名の定義と違う`)
      }
      hoisted.set(name, definition)
    }
  }
  return Object.fromEntries(hoisted)
}

function leafComponent<Name extends string, Shape extends { readonly kind: z.ZodType }>(
  component: Name,
  schema: z.ZodObject<Shape>,
) {
  return z.object({
    id: z.string(),
    component: z.literal(component),
    ...omit(schema.shape, ["kind"]),
  })
}
