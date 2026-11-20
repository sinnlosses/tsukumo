// 本文の印 `{{cite: …}}` と根の `sources`（出典の一覧）の照らし合わせの検査の家族。違反の型・検出・差し戻し文を持つ。
// 差し戻しの文には書き手が付けた id だけを出し、本文と出典の題・URL の字は写さない。

import { isPlainObject, omit, sumBy, unique, uniqueBy } from "remeda"

import {
  citableTexts,
  citeCount,
  citedSourceIds,
  reportSourcesOf,
} from "../../../../shared/report/report-citation.ts"
import { drawnLeaves, type ReportOutline } from "../../../../shared/report/report-outline.ts"
import type { ReportDraft } from "./draft.ts"

export type CitationViolation =
  /** 印が指す id が `sources` に無い。`ids` は無かった id。 */
  | { readonly kind: "unknown-cite"; readonly count: number; readonly ids: readonly string[] }
  /** `sources` の出典が置ける欄のどこからも指されない。`ids` はその出典の id。 */
  | { readonly kind: "uncited-source"; readonly count: number; readonly ids: readonly string[] }
  /** `sources` に同じ id が2回以上ある。`ids` は重なった id。 */
  | {
      readonly kind: "duplicate-source-id"
      readonly count: number
      readonly ids: readonly string[]
    }
  /** `sources` に同じ URL（末尾の `/` と `#` 以降を除いて比べる）が2回以上ある。`ids` は2回目以降の出典の id。 */
  | {
      readonly kind: "duplicate-source-url"
      readonly count: number
      readonly ids: readonly string[]
    }
  /** 置ける欄の外（結論・見出しなど）にある印の数。 */
  | { readonly kind: "misplaced-cite"; readonly count: number }

const CITATION_KINDS: ReadonlySet<string> = new Set<CitationViolation["kind"]>([
  "unknown-cite",
  "uncited-source",
  "duplicate-source-id",
  "duplicate-source-url",
  "misplaced-cite",
])

type CitationSource = Pick<
  ReportDraft,
  "components" | "conclusion" | "favor" | "keyFigures" | "checks"
>

const DRAFT_ROOT_FIELDS = ["conclusion", "favor", "keyFigures", "checks"] as const

/** 出典の違反を、当てはまらないもの（`count` が 0）も含めて並べる。 */
export function detectCitationViolations(
  report: CitationSource,
  outline: ReportOutline,
): readonly CitationViolation[] {
  const sources = reportSourcesOf(report.components)
  const sourceIds = sources.map((source) => source.id)
  const leaves = uniqueBy(drawnLeaves(outline), (leaf) => leaf.id)
  const cited = citedSourceIds(leaves)
  const unknown = cited.filter((id) => !sourceIds.includes(id))
  const uncited = unique(sourceIds.filter((id) => !cited.includes(id)))
  const duplicatedIds = unique(sourceIds.filter((id, index) => sourceIds.indexOf(id) !== index))
  const urls = sources.map((source) => comparableUrl(source.url))
  const duplicatedUrls = sources
    .filter((_, index) => urls.indexOf(urls[index] ?? "") !== index)
    .map((source) => source.id)
  const citable = sumBy(leaves.flatMap(citableTexts), citeCount)
  return [
    { kind: "unknown-cite", count: unknown.length, ids: unknown },
    { kind: "uncited-source", count: uncited.length, ids: uncited },
    { kind: "duplicate-source-id", count: duplicatedIds.length, ids: duplicatedIds },
    { kind: "duplicate-source-url", count: duplicatedUrls.length, ids: duplicatedUrls },
    { kind: "misplaced-cite", count: allCiteCount(report) - citable },
  ]
}

export function isCitationViolation(violation: {
  readonly kind: string
}): violation is CitationViolation {
  return CITATION_KINDS.has(violation.kind)
}

/** 出典の違反を、差し戻すときの1行の文面にする。 */
export function citationViolationMessage(violation: CitationViolation): string {
  switch (violation.kind) {
    case "unknown-cite":
      return `\`{{cite: …}}\` が \`sources\` に無い id を指している（${violation.ids.join("・")}）。\`sources\` に足すか印を消す`
    case "uncited-source":
      return `\`sources\` の出典が本文のどこからも指されていない（${violation.ids.join("・")}）。本文に \`{{cite: id}}\` を置くか \`sources\` から外す`
    case "duplicate-source-id":
      return `\`sources\` に同じ id が2回以上ある（${violation.ids.join("・")}）。id を1つにまとめる`
    case "duplicate-source-url":
      return `\`sources\` に同じ URL の出典が2回以上ある（${violation.ids.join("・")}）。1件にまとめ、印の id をそろえる`
    case "misplaced-cite":
      return `\`{{cite: …}}\` が置けない欄に${violation.count}個ある。印は Paragraph の text・Table のセルと行の詳細・ItemList の項目の text・Claims の claim と basis にだけ置き、結論の根拠は節の本文で指す`
  }
}

function comparableUrl(url: string): string {
  return url.replace(/#.*$/, "").replace(/\/+$/, "")
}

/**
 * レポートの全部の文字の欄（入れ子を含む）にある印の数。
 * 根の欄のうち検査用の欄を別に持つもの（前の呼び出しから引き継ぐことがある）は、根でなく検査用の欄を読む。
 */
function allCiteCount(report: CitationSource): number {
  const texts = [
    report.conclusion,
    report.favor,
    ...stringsIn(report.keyFigures),
    ...stringsIn(report.checks),
    ...report.components.flatMap((part) =>
      stringsIn(part.component === "Report" ? omit(part, DRAFT_ROOT_FIELDS) : part),
    ),
  ]
  return sumBy(texts, citeCount)
}

function stringsIn(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsIn)
  }
  return isPlainObject(value) ? Object.values(value).flatMap(stringsIn) : []
}
