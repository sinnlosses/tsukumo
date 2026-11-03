// 表・対応表・見比べ・数・候補の採否の塊の形。

import { isPlainObject } from "remeda"
import { z } from "zod"

import { beforeAfterSideSchema } from "./report-block-diagram.ts"
import { aside, type DeepReadonly, fold, inlineText, omittable } from "./report-block-field.ts"

export const REPORT_CELL_STATUSES = ["ok", "warn", "ng"] as const

const cellSchema = z.union([
  inlineText,
  z
    .object({ status: z.enum(REPORT_CELL_STATUSES), text: inlineText })
    .describe("状態のセル。記号付きの印で描くので、状態を言う文字も text に書く"),
  z
    .object({ from: inlineText, to: inlineText })
    .describe("変わったセル（A → B と書かず前と後に分ける。状態は隣の列に置く）"),
  z.object({ tag: inlineText }),
])

const tableRowSchema = z.union([
  z.array(cellSchema),
  z.object({
    cells: z.array(cellSchema),
    emphasis: z.literal(true).optional(),
    detail: inlineText.optional().describe("セルに入らない行ごとの詳しい中身。開いて読む"),
  }),
])

type TableRow = DeepReadonly<z.infer<typeof tableRowSchema>>
export type TableCell = DeepReadonly<z.infer<typeof cellSchema>>

export function tableRowCells(row: TableRow): readonly TableCell[] {
  return "cells" in row ? row.cells : row
}

export function isEmphasisRow(row: TableRow): boolean {
  return "emphasis" in row && row.emphasis === true
}

export function tableRowDetail(row: TableRow): string | undefined {
  return "detail" in row ? row.detail : undefined
}

export const tableBlockSchema = z
  .object({
    kind: z.literal("table"),
    title: inlineText.describe(
      "セルに無いことだけ: 何を並べた表か・並べた基準・数の出どころ。数と向きで主張を言う1文。評価語なし",
    ),
    columns: z.array(inlineText).min(2).describe("列は5つまで"),
    rows: z
      .array(tableRowSchema)
      .min(1)
      .describe("行ごとのセル。数は columns と揃える。セルは1行、空にせず「なし」と書く"),
    rest: omittable(inlineText, ""),
    emphasisColumn: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("案を列に並べた表で採った案の列（0始まり）"),
    fold,
    aside,
  })
  .describe(
    "比較・対応・件数。同じ形の項目が2つ以上並んだら表（候補の採否は options、交点が状態だけなら matrix）。行は大きさか重要度の順（1列目のあいうえお順にしない）。単位は見出しに1回だけ書きセルに書かない。セルは語句・数・状態にする（セルの平均が35字以上の列は差し戻し。文の列は label 付きの list か文の部品へ）",
  )

export const REPORT_MATRIX_STATUSES = ["ok", "warn", "ng", "na"] as const

export const matrixBlockSchema = z
  .object({
    kind: z.literal("matrix"),
    title: inlineText,
    columns: z.array(inlineText).min(1),
    rows: z
      .array(z.object({ name: inlineText, cells: z.array(z.enum(REPORT_MATRIX_STATUSES)) }))
      .min(1),
    fold,
    aside,
  })
  .describe("行×列の交点が状態だけの対応表（機能×条件）。交点に文や数が要るなら table")

const COMPARE_RELATIONS = ["versus", "before-after"] as const

// kind の無い側（旧い形）は points として読む
const compareSideSchema = z.preprocess(
  (side) => (isPlainObject(side) && side.kind === undefined ? { ...side, kind: "points" } : side),
  beforeAfterSideSchema.and(z.object({ heading: omittable(inlineText, "") })),
)

export const compareBlockSchema = z
  .object({
    kind: z.literal("compare"),
    title: inlineText,
    relation: omittable(z.enum(COMPARE_RELATIONS), "versus"),
    sides: z.array(compareSideSchema).min(2).max(2),
    fold,
    aside,
  })
  .describe(
    "2つを左右に並べて見比べる（案A と案B も、画面の撮影・構造の前と後も）。relation が versus（既定）なら対等な2つで、側の heading が札。before-after なら左が前・右が後で間に矢印、札は「前」「後」（heading は札に添える）。側ごとに image / code / points / mermaid / svg のどれか（左右で違ってよい。時間の順の前後は mermaid の側）。1行の設定や文言の変更には使わない。ファイル名の箇条書きで変更を説明しない。採否は options、値を揃えるなら table（3つ以上も table）。数の前後は stats の before、行ごとの差分は code の diff",
  )

/** 質問の添え書きの `compare`。書けるのは対等な2つの見出しと箇条だけで、読んだ値は `compare` の塊と同じ形。 */
export const pointsCompareBlockSchema = z
  .object({
    kind: z.literal("compare"),
    title: inlineText,
    sides: z
      .array(
        z.object({
          heading: inlineText,
          points: z.array(inlineText).min(1),
        }),
      )
      .min(2)
      .max(2),
    fold,
    aside,
  })
  .describe(
    "2つを同時に見比べる（案A と案B。変更の前と後は beforeAfter）。側ごとに見出しと短い箇条。採否は options、値を揃えるなら table（3つ以上も table）",
  )
  .transform((block) => ({
    ...block,
    relation: "versus" as const,
    sides: block.sides.map((side) => ({ kind: "points" as const, ...side })),
  }))

const statItemsSchema = z
  .array(
    z.object({
      before: omittable(z.string(), ""),
      value: z.string(),
      total: omittable(z.string(), "").describe(
        "全体の数（割合を帯で添える。value が全体のうちの数のとき）",
      ),
      label: inlineText,
      series: omittable(z.array(z.number()), []).describe(
        "推移の数の並び（3つ以上。省いてよい）。value の左に折れ線で添える",
      ),
      better: omittable(z.enum(["up", "down", ""]), "").describe(
        "before と value が数のとき、増えて良いなら up・減って良いなら down",
      ),
    }),
  )
  .min(3)
  .max(4)

/** `report` の `keyFigures`（結論の直下に並べる、結論に効く数）。項目の形は `stats` の `items` と同じ。 */
export const keyFiguresSchema = statItemsSchema

export type KeyFigures = DeepReadonly<z.infer<typeof keyFiguresSchema>>

/** 読み戻した `keyFigures`。「無い」と形の崩れは空の配列に畳む。 */
export function parseKeyFigures(value: unknown): KeyFigures {
  const parsed = keyFiguresSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

export const statsBlockSchema = z
  .object({
    kind: z.literal("stats"),
    items: statItemsSchema,
    fold,
    aside,
  })
  .describe(
    "結論に効く数（件数・前後の差）。数が3〜4個並び、前後か推移を見せるとき。推移の形が要る数には series、増減の良い向きが要る数には better",
  )

const REPORT_OPTION_VERDICTS = ["adopt", "consider", "reject"] as const

export const optionsBlockSchema = z
  .object({
    kind: z.literal("options"),
    title: inlineText,
    items: z
      .array(
        z.object({
          name: inlineText,
          verdict: z.enum(REPORT_OPTION_VERDICTS),
          reason: inlineText,
        }),
      )
      .min(2),
    fold,
    aside,
  })
  .describe(
    "候補を比べて採る・検討・採らないを言うとき。採る → 検討 → 採らないの順に書く（崩れると差し戻す）。書いた順に1始まりの番号を振って描く",
  )
