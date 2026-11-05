// 触れるレポートで、式の値（`expr`・`format`）を結べる props を持つ塊と、つまみの部品の形。
// 書き手が書いた一覧（式を持つ）の型で、初期値で評価した静的な一覧は元の塊の型のまま読む。
// 形だけを見る。式の構文・名前・評価の検査はここに置かない。

import { z } from "zod"

import { statItemsSchema, statsBlockSchema } from "./report-block-comparison.ts"
import { chartBlockSchema } from "./report-block-diagram.ts"
import { inlineText, omittable } from "./report-block-field.ts"
import { textBlockSchema } from "./report-block-prose.ts"

const exprCallSchema = z.object({
  call: z.literal("expr"),
  args: z.object({ source: z.string() }),
})

/** 文字の中の `${…}` を式の結果で埋めた文字。 */
const formatCallSchema = z.object({
  call: z.literal("format"),
  args: z.object({ template: z.string() }),
})

/** リテラルの代わりに結べる値の形（A2UI v0.9 の `FunctionCall`）。結べる props はこの 1 つの定義を参照する。 */
const expressionValueSchema = z
  .union([exprCallSchema, formatCallSchema])
  .meta({ id: "ExpressionValue" })

function orExpression<S extends z.ZodType>(schema: S) {
  return z.union([schema, expressionValueSchema])
}

function described<S extends z.ZodType>(schema: S, source: z.ZodType): S {
  return source.description === undefined ? schema : schema.describe(source.description)
}

const writtenStatItemSchema = statItemsSchema.element.extend({
  before: omittable(orExpression(z.string()), ""),
  value: orExpression(z.string()),
  target: described(omittable(orExpression(z.string()), ""), statItemsSchema.element.shape.target),
})

/** `Paragraph` の塊で、`text` に式を結べる形。 */
export const writtenTextBlockSchema = textBlockSchema.extend({
  text: described(orExpression(inlineText), textBlockSchema.shape.text),
})

/** `Stats` の塊で、`items[].value`・`before`・`target` に式を結べる形。 */
export const writtenStatsBlockSchema = described(
  statsBlockSchema.extend({ items: z.array(writtenStatItemSchema).min(3).max(4) }),
  statsBlockSchema,
)

/** `Chart` の塊で、`title`・`labels`・`series[].values`・`emphasis` に式を結べる形。 */
export const writtenChartBlockSchema = described(
  chartBlockSchema.extend({
    title: described(omittable(orExpression(inlineText), ""), chartBlockSchema.shape.title),
    labels: orExpression(inlineText.array().min(1)),
    series: z
      .array(
        chartBlockSchema.shape.series.element.extend({
          values: orExpression(z.array(z.number()).min(1)),
        }),
      )
      .min(1),
    emphasis: described(
      omittable(orExpression(inlineText.array()), []),
      chartBlockSchema.shape.emphasis,
    ),
  }),
  chartBlockSchema,
)

const PARAMETER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

const parameterName = z
  .string()
  .regex(PARAMETER_NAME_PATTERN)
  .describe("式から読む名前。ほかのつまみ・defs の名前や関数の名前と重ねない")

export const parameterSliderSchema = z
  .object({
    id: z.string(),
    component: z.literal("ParameterSlider"),
    name: parameterName,
    label: z.string(),
    min: z.number(),
    max: z.number(),
    step: z.number(),
    initial: z.number(),
  })
  .describe(
    "読み手が振る数のつまみ。min < max、step > 0。initial は min から step の倍数の位置で、目盛りは101個まで。Section か配置の部品の子に置く（Report.figure には置けない）。式が読まないつまみは置かない",
  )

export const parameterCheckBoxSchema = z
  .object({
    id: z.string(),
    component: z.literal("ParameterCheckBox"),
    name: parameterName,
    label: z.string(),
    initial: z.boolean(),
  })
  .describe("読み手が切り替える真偽のつまみ。置き場は ParameterSlider と同じ")

/** 静的な一覧に載らないので、見本帳にまだ並べないつまみの部品名。 */
export const PARAMETER_COMPONENT_NAMES: readonly string[] = [
  parameterSliderSchema.shape.component.value,
  parameterCheckBoxSchema.shape.component.value,
]

export const reportDefsSchema = z
  .record(z.string(), z.string())
  .optional()
  .describe(
    "名前つきの式（名前 → 式）。同じ計算を2か所以上で使うなら、ここに名前を付けて一度だけ書く。つまみの name と、ほかの defs の名前を式から読める",
  )
