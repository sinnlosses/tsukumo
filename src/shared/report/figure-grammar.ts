// 図の申告（問い・データ・関係）の `plot` の塊の形と、型と値の整合の検査。色・座標は書かせない。
// 形は決定表（`plotFormOf`）が決め、書き手は `form` で上書きできる。

import { z } from "zod"

import { aside, type DeepReadonly, fold, inlineText, omittable } from "./report-block-field.ts"

/** 決定表が返す形。`form` の欄で書き手が選べる値でもある。 */
const FIGURE_FORMS = [
  "text",
  "table",
  "bar",
  "line",
  "pie",
  "numberLine",
  "bullet",
  "scatter",
  "histogram",
  "graph",
  "stats",
] as const

export type FigureForm = (typeof FIGURE_FORMS)[number]

/** 列の型。N 名義・O 順序・T 時間・Q 量。 */
const PLOT_COLUMN_TYPES = ["N", "O", "T", "Q"] as const

/** 読者がその図で何をするか。 */
const PLOT_RELATIONS = [
  "compare",
  "rank",
  "part",
  "trend",
  "change",
  "distribution",
  "correlate",
  "range",
] as const

/** `question` の字数の上限（全角）。 */
const MAX_PLOT_QUESTION = 60

const plotColumnSchema = z.object({
  name: inlineText,
  type: z.enum(PLOT_COLUMN_TYPES),
  values: z.array(z.union([z.string(), z.number()])),
})

type PlotColumn = DeepReadonly<z.infer<typeof plotColumnSchema>>

export const plotBlockSchema = z
  .object({
    kind: z.literal("plot"),
    question: inlineText
      .refine((text) => text.trim() !== "" && [...text].length <= MAX_PLOT_QUESTION, {
        message: `question は読者がこの図で決めることを1文（${String(MAX_PLOT_QUESTION)}字以内）で書く`,
      })
      .describe("この図で読者が決めること。1文"),
    data: z.array(plotColumnSchema).min(1),
    relation: z.enum(PLOT_RELATIONS),
    form: omittable(z.enum(["auto", ...FIGURE_FORMS]), "auto").describe(
      "省けば決定表が形を決める。置いてはならない形は採らない",
    ),
    fold,
    aside,
  })
  .superRefine(addPlotDataIssues)
  .describe(
    "図の申告。問い（question）・列の並び（data。name・type〔N 名義・O 順序・T 時間・Q 量〕・values）・関係（relation）を書き、色・座標は書かない",
  )

export type ReportPlot = DeepReadonly<z.infer<typeof plotBlockSchema>>

/** 列ごとの values を行ごとのセルへ起こす（行は先頭の列の長さ）。 */
export function plotRows(plot: ReportPlot): readonly (readonly string[])[] {
  const length = plot.data[0]?.values.length ?? 0
  return Array.from({ length }, (_, row) =>
    plot.data.map((column) => String(column.values[row] ?? "")),
  )
}

export function addPlotDataIssues(
  block: { readonly data: readonly PlotColumn[] },
  context: z.core.$RefinementCtx,
): void {
  for (const fault of plotDataFaults(block.data)) {
    context.addIssue({ code: "custom", message: fault, path: ["data"] })
  }
}

/** 列の長さの不一致と、`Q` の列に数でない値がある位置を、書き手に返す文にする。 */
function plotDataFaults(columns: readonly PlotColumn[]): readonly string[] {
  const length = columns[0]?.values.length ?? 0
  return columns.flatMap((column, index) => [
    ...(column.values.length === length
      ? []
      : [`${String(index + 1)}列目（${column.name}）の values の長さが1列目と違う`]),
    ...(column.type === "Q" &&
    column.values.some((value) => typeof value !== "number" || !Number.isFinite(value))
      ? [`${String(index + 1)}列目（${column.name}）は Q なので values は数だけにする`]
      : []),
  ])
}
