// `report` の欄 `retrospective`（ワークフローの振り返りの段の結果）の形。形の出どころはここだけ。
// 本文の節（`sections`）とは別の欄で受け、見出し「振り返り」の節として最後に描く。段の名前は見ない（欄があるときだけ描く）。

import { isPlainObject } from "remeda"
import { z } from "zod"

import { nonEmpty, omittable } from "./report-block-field.ts"
import { namedWriterBlockSchema, parseReportBlocks, type ReportBlock } from "./report-block.ts"

export const reportRetrospectiveSchema = z.object({
  summary: nonEmpty(z.string().trim()).describe("結果を1〜2文で"),
  drafts: omittable(z.array(nonEmpty(z.string().trim())), []).describe("積んだドラフトのID"),
  blocks: omittable(z.array(namedWriterBlockSchema), []).describe(
    "結果の根拠に図・表・コードが要るときだけ。sections の blocks と同じ部品",
  ),
})

/** 塊を1つずつ読むために、結果とドラフトだけを先に検証する形。 */
const looseRetrospectiveSchema = reportRetrospectiveSchema.extend({
  blocks: omittable(z.array(z.unknown()), []),
})

/** レポートが載せる振り返りの結果。欄が無い・形が崩れたレポートと、欄を持たなかったころの記録は `none`。 */
export type ReportRetrospective =
  | { readonly kind: "none" }
  | {
      readonly kind: "recorded"
      readonly summary: string
      readonly drafts: readonly string[]
      readonly blocks: readonly ReportBlock[]
    }

const NO_REPORT_RETROSPECTIVE = {
  kind: "none",
} as const satisfies ReportRetrospective

/**
 * `report` の引数の `retrospective` を取り出す。「無い」と形の崩れは `none` に畳む。
 * 塊は1つずつ検証し、崩れた塊と知らない種類の塊は落とす（塊1つの読み損ねで振り返りを捨てない）。
 */
export function parseReportRetrospective(value: unknown): ReportRetrospective {
  if (!isPlainObject(value)) {
    return NO_REPORT_RETROSPECTIVE
  }
  const parsed = looseRetrospectiveSchema.safeParse(value)
  return parsed.success
    ? { kind: "recorded", ...parsed.data, blocks: parseReportBlocks(parsed.data.blocks) }
    : NO_REPORT_RETROSPECTIVE
}

/** 振り返りの節の末尾に描く、積んだドラフトの行。 */
export function retrospectiveDraftsLine(drafts: readonly string[]): string {
  return `積んだドラフト: ${drafts.map((id) => `\`${id}\``).join("、")}`
}
