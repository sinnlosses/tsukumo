// `report` の部品を A2UI のカタログの部品（`component` の判別子と `id` を持つ props）として定義する。
// 葉の props と説明は既存の塊の zod を使い回す。

import { mapValues, omit } from "remeda"
import { z } from "zod"

import { BASIC_PART_DEFS, BASIC_PARTS } from "./a2ui-basic-part-list.ts"
import { plotBlockSchema } from "./figure-grammar.ts"
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
  textBlockSchema,
} from "./report-block-prose.ts"
import { REPORT_FIGURE_NONE_REASONS, reportSectionSchema } from "./report-block.ts"
import { reportCheckSchema } from "./report-check.ts"
import { reportRetrospectiveSchema } from "./report-retrospective.ts"
import { reportTaskSchema } from "./report-task.ts"
import { timelineBlockSchema } from "./timeline-block.ts"

/** 部品名と schema。`writerBlockBranches` の 19 種と 1 対 1。 */
const LEAF_COMPONENTS = {
  Paragraph: leafComponent("Paragraph", textBlockSchema),
  ItemList: leafComponent("ItemList", listBlockSchema),
  Table: leafComponent("Table", tableBlockSchema),
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
  Picture: leafComponent("Picture", imageBlockSchema),
  Plot: leafComponent("Plot", plotBlockSchema),
  Markdown: leafComponent("Markdown", markdownBlockSchema),
} as const

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
  conclusion: z.array(z.string()).optional(),
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

const CATALOG_ID = "https://tsukumo.example/catalogs/report/v1"

/** AI に渡し、`Catalog.fromJson` に読ませるカタログ文書（自作分は zod から出し、基本の 5 部品は定数）。 */
export function buildReportCatalogDocument() {
  const own = {
    Report: reportComponentSchema,
    Section: sectionComponentSchema,
    ...LEAF_COMPONENTS,
  }
  const schemas = mapValues(own, (schema) => z.toJSONSchema(schema, { io: "input" }))
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
