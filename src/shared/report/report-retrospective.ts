// `report` の欄 `retrospective`（ワークフローの振り返りの段の結果）の形。形の出どころはここだけ。
// 本文の節（`sections`）とは別の専用の塊に描き、段の名前は見ない（欄があるときだけ描く）。

import { isPlainObject } from "remeda"
import { z } from "zod"

export const reportRetrospectiveSchema = z.object({
  summary: z.string().trim().min(1).describe("結果を1〜2文で"),
  drafts: z.array(z.string().trim().min(1)).default([]).describe("積んだドラフトのID"),
})

/** レポートが載せる振り返りの結果。欄が無い・形が崩れたレポートと、欄を持たなかったころの記録は `none`。 */
export type ReportRetrospective =
  | { readonly kind: "none" }
  | {
      readonly kind: "recorded"
      readonly summary: string
      readonly drafts: readonly string[]
    }

const NO_REPORT_RETROSPECTIVE = {
  kind: "none",
} as const satisfies ReportRetrospective

/** `report` の引数の `retrospective` を取り出す。「無い」と形の崩れは `none` に畳む。 */
export function parseReportRetrospective(value: unknown): ReportRetrospective {
  if (!isPlainObject(value)) {
    return NO_REPORT_RETROSPECTIVE
  }
  const parsed = reportRetrospectiveSchema.safeParse(value)
  return parsed.success ? { kind: "recorded", ...parsed.data } : NO_REPORT_RETROSPECTIVE
}

/**
 * 振り返りの塊の Markdown。`sections` の後ろ・`favor` の前に置く。
 * HTML の中に Markdown を入れるので、塊の内側の前後に空行を空ける。欄が無ければ空文字。
 */
export function retrospectiveMarkdown(retrospective: ReportRetrospective): string {
  if (retrospective.kind === "none") {
    return ""
  }
  const drafts =
    retrospective.drafts.length === 0
      ? ""
      : `\n\n積んだドラフト: ${retrospective.drafts.map((id) => `\`${id}\``).join("、")}`
  return (
    `<div class="retrospective">\n\n<div class="retrospective-label">振り返り</div>\n\n` +
    `${retrospective.summary}${drafts}\n\n</div>`
  )
}
