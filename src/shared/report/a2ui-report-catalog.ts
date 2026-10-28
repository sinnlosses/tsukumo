// `report` の部品を A2UI のカタログの部品（`component` の判別子と `id` を持つ props）として定義する。
// 葉の props と説明は既存の塊の zod を使い回す。

import { mapValues, omit } from "remeda"
import { z } from "zod"

import { BASIC_PART_DEFS, BASIC_PART_SCHEMAS, BASIC_PARTS } from "./a2ui-basic-part-list.ts"
import { addPlotDataIssues, plotBlockSchema } from "./figure-grammar.ts"
import {
  compareBlockSchema,
  keyFiguresSchema,
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
import {
  claimsBlockSchema,
  codeBlockSchema,
  listBlockSchema,
  markdownBlockSchema,
  noteBlockSchema,
  quoteBlockSchema,
  textBlockSchema,
} from "./report-block-prose.ts"
import {
  REPORT_FIGURE_NONE_REASONS,
  reportFigureSchema,
  reportSectionSchema,
} from "./report-block.ts"
import { reportCheckSchema } from "./report-check.ts"
import {
  FIRST_SENTENCE_TARGET,
  FIRST_SENTENCE_TARGET_COMMAS,
  MAX_CONCLUSION_SENTENCES,
  MAX_FIRST_SENTENCE,
} from "./report-limit.ts"
import { reportRetrospectiveSchema } from "./report-retrospective.ts"
import { reportTaskSchema } from "./report-task.ts"
import { timelineBlockSchema } from "./timeline-block.ts"

/** 部品名と schema。`writerBlockBranches` の 20 種と 1 対 1。 */
const LEAF_COMPONENTS = {
  Paragraph: leafComponent("Paragraph", textBlockSchema),
  ItemList: leafComponent("ItemList", listBlockSchema),
  Table: leafComponent("Table", tableBlockSchema).extend({
    sortable: z.boolean().optional().describe("true で列の見出しを押して並べ替えられる"),
    filterable: z
      .boolean()
      .optional()
      .describe(
        'true で ChoicePicker の value を {path: "/view/<この表のID>/filter"} に結ぶと行が絞られる',
      ),
    filterColumn: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("絞り込みで見る列の位置（0 始まり）。省略すると全列"),
  }),
  Matrix: leafComponent("Matrix", matrixBlockSchema),
  Compare: leafComponent("Compare", compareBlockSchema),
  BeforeAfter: leafComponent("BeforeAfter", beforeAfterBlockSchema),
  Note: leafComponent("Note", noteBlockSchema),
  Stats: leafComponent("Stats", statsBlockSchema),
  Code: leafComponent("Code", codeBlockSchema),
  Mermaid: leafComponent("Mermaid", mermaidBlockSchema),
  Graph: leafComponent("Graph", graphBlockSchema),
  Chart: leafComponent("Chart", chartBlockSchema),
  Svg: leafComponent("Svg", svgBlockSchema),
  Timeline: leafComponent("Timeline", timelineBlockSchema),
  Options: leafComponent("Options", optionsBlockSchema),
  Claims: leafComponent("Claims", claimsBlockSchema),
  Quote: leafComponent("Quote", quoteBlockSchema),
  Picture: leafComponent("Picture", imageBlockSchema),
  // leafComponent は塊ぜんたいに掛かる検査（superRefine）を写さないので、Plot の data の検査はここで掛け直す
  Plot: leafComponent("Plot", plotBlockSchema).superRefine(addPlotDataIssues),
  Markdown: leafComponent("Markdown", markdownBlockSchema),
} as const

/** 葉の部品名と、写す先の塊の `kind`。 */
export const LEAF_COMPONENT_KINDS = {
  Paragraph: textBlockSchema.shape.kind.value,
  ItemList: listBlockSchema.shape.kind.value,
  Table: tableBlockSchema.shape.kind.value,
  Matrix: matrixBlockSchema.shape.kind.value,
  Compare: compareBlockSchema.shape.kind.value,
  BeforeAfter: beforeAfterBlockSchema.shape.kind.value,
  Note: noteBlockSchema.shape.kind.value,
  Stats: statsBlockSchema.shape.kind.value,
  Code: codeBlockSchema.shape.kind.value,
  Mermaid: mermaidBlockSchema.shape.kind.value,
  Graph: graphBlockSchema.shape.kind.value,
  Chart: chartBlockSchema.shape.kind.value,
  Svg: svgBlockSchema.shape.kind.value,
  Timeline: timelineBlockSchema.shape.kind.value,
  Options: optionsBlockSchema.shape.kind.value,
  Claims: claimsBlockSchema.shape.kind.value,
  Quote: quoteBlockSchema.shape.kind.value,
  Picture: imageBlockSchema.shape.kind.value,
  Plot: plotBlockSchema.shape.kind.value,
  Markdown: markdownBlockSchema.shape.kind.value,
} as const satisfies Record<keyof typeof LEAF_COMPONENTS, string>

const FIGURE_KINDS: readonly string[] = reportFigureSchema.options.map(
  (option) => option.shape.kind.value,
)

/** `Report.figure` に置ける葉の部品名。 */
export const FIGURE_COMPONENTS: readonly string[] = Object.entries(LEAF_COMPONENT_KINDS)
  .filter(([, kind]) => FIGURE_KINDS.includes(kind))
  .map(([component]) => component)

const speechSchema = z.object({ text: z.string(), expression: z.string() })

/** 節。`children` は葉と配置の部品の ID。 */
const sectionComponentSchema = z.object({
  id: z.string(),
  component: z.literal("Section"),
  heading: reportSectionSchema.shape.heading,
  children: z.array(z.string()).min(1),
})

/** 根。`children` は `Section` の ID、`figure` は図の部品の ID。 */
const reportComponentSchema = z.object({
  id: z.string(),
  component: z.literal("Report"),
  task: reportTaskSchema.optional(),
  workPlanClosing: z.enum(["finished", "stopped"]).optional(),
  conclusion: z
    .array(z.string())
    .optional()
    .describe(
      `結論。レポートの冒頭の文を1要素1文（句点まで）で1〜${String(MAX_CONCLUSION_SENTENCES)}要素。1文目は全角${String(MAX_FIRST_SENTENCE)}字以内（目安は${String(FIRST_SENTENCE_TARGET)}字、読点は${String(FIRST_SENTENCE_TARGET_COMMAS)}つまで）。悪い例: 「設定の読み込みを共通化し、型を整理し、テストも足して、起動の流れを書き換えた」（変更の列挙）。良い例: 「次から設定の書き間違いが起動時に分かる」（読み手から見た変化）。2文目は「それで何が良いか」か「変えていないもの」。例: ["…分かる。", "読み方は変えていない。"]`,
    ),
  keyFigures: keyFiguresSchema.optional(),
  figure: z.string().optional(),
  figureNone: z.enum(REPORT_FIGURE_NONE_REASONS).optional(),
  children: z.array(z.string()).min(1),
  retrospective: reportRetrospectiveSchema
    .extend({
      blocks: z
        .array(z.string())
        .optional()
        .describe("結果の根拠に図・表・コードが要るときだけ。部品の ID"),
    })
    .optional(),
  favor: z.string().optional(),
  checks: z.array(reportCheckSchema).optional(),
  title: z.string().optional(),
  sessionSummary: z.string().optional(),
  sessionRemaining: z.string().optional(),
  closing: speechSchema.optional(),
  waitingLine: speechSchema.optional(),
})

const OWN_COMPONENT_SCHEMAS = {
  Report: reportComponentSchema,
  Section: sectionComponentSchema,
  ...LEAF_COMPONENTS,
} as const

/** 部品名と受理の形。根・節・葉 20 種・基本 6 部品の 28。 */
export const REPORT_COMPONENT_SCHEMAS = {
  ...OWN_COMPONENT_SCHEMAS,
  ...BASIC_PART_SCHEMAS,
} as const

/** 部品 1 つの受理の形（28 部品のどれか）。 */
export const a2uiReportComponentSchema = z.discriminatedUnion("component", [
  reportComponentSchema,
  sectionComponentSchema,
  ...Object.values(LEAF_COMPONENTS),
  ...Object.values(BASIC_PART_SCHEMAS),
])

export type A2uiReportComponent = z.infer<typeof a2uiReportComponentSchema>

const CATALOG_ID = "https://tsukumo.example/catalogs/report/v1"

/** AI に渡し、`Catalog.fromJson` に読ませるカタログ文書（自作分は zod から出し、基本の 6 部品は定数）。 */
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
