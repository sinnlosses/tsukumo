// 根の `terms`（用語の注）と本文の照らし合わせの検査の家族。違反の型・検出・差し戻し文を持つ。
// 差し戻しの文には書き手が付けた語だけを出し、本文と注の字は写さない。

import { unique, uniqueBy } from "remeda"

import { drawnLeaves, type ReportOutline } from "../../../../shared/report/report-outline.ts"
import { firstTermPlaces, reportTermsOf } from "../../../../shared/report/report-term-place.ts"
import type { ReportDraft } from "./draft.ts"

export type TermNoteViolation =
  /** `terms` の語が置ける欄の照らす字のどこにも無い。`terms` はその語。 */
  | { readonly kind: "absent-term"; readonly count: number; readonly terms: readonly string[] }
  /** `terms` に同じ語が2回以上ある。`terms` は重なった語。 */
  | { readonly kind: "duplicate-term"; readonly count: number; readonly terms: readonly string[] }

const TERM_NOTE_KINDS: ReadonlySet<string> = new Set<TermNoteViolation["kind"]>([
  "absent-term",
  "duplicate-term",
])

/** 用語の注の違反を、当てはまらないもの（`count` が 0）も含めて並べる。 */
export function detectTermNoteViolations(
  report: Pick<ReportDraft, "components">,
  outline: ReportOutline,
): readonly TermNoteViolation[] {
  const terms = reportTermsOf(report.components)
  const words = terms.map((entry) => entry.term)
  const places = firstTermPlaces(
    terms,
    uniqueBy(drawnLeaves(outline), (leaf) => leaf.id),
  )
  const absent = unique(words.filter((word) => !places.has(word)))
  const duplicated = unique(words.filter((word, index) => words.indexOf(word) !== index))
  return [
    { kind: "absent-term", count: absent.length, terms: absent },
    { kind: "duplicate-term", count: duplicated.length, terms: duplicated },
  ]
}

export function isTermNoteViolation(violation: {
  readonly kind: string
}): violation is TermNoteViolation {
  return TERM_NOTE_KINDS.has(violation.kind)
}

/** 用語の注の違反を、差し戻すときの1行の文面にする。 */
export function termNoteViolationMessage(violation: TermNoteViolation): string {
  switch (violation.kind) {
    case "absent-term":
      return `\`terms\` の語が本文のどこにも無い（${violation.terms.join("・")}）。本文に出る字そのものを書くか \`terms\` から外す。照らすのは Paragraph の text・Table のセルと行の詳細・ItemList の項目の text・Claims の claim と basis で、inline code・リンク・印の中は数えない`
    case "duplicate-term":
      return `\`terms\` に同じ語が2回以上ある（${violation.terms.join("・")}）。1件にまとめる`
  }
}
