// 根の `terms`（用語の注）の読み出しと、用語ごとの本文での初出の場所の決め方。

import type { A2uiReportComponent } from "./a2ui-report-catalog.ts"
import { CODE_SPAN, textOutsideInlineMarks } from "./inline-mark.ts"
import { citableTexts } from "./report-citation.ts"
import type { ReportOutlineLeaf } from "./report-outline.ts"
import type { ReportTerm } from "./report-term.ts"

const LINK = /\[[^\]\n]*\]\([^)\n]*\)/g

/** 除いた範囲の前後の字が繋がって語に当たらないよう、term に出ない改行で置き換える。 */
const GAP = "\n"

/** 用語の初出の場所。内容部品の id と、その部品の置ける欄の字。 */
export type TermPlace = { readonly leafId: string; readonly text: string }

/** 根の `Report` の `terms`。無ければ空。 */
export function reportTermsOf(components: readonly A2uiReportComponent[]): readonly ReportTerm[] {
  return components.find((part) => part.component === "Report")?.terms ?? []
}

/**
 * 用語ごとの初出の場所。内容部品を並びの順に、各部品の置ける欄を欄の順に読み、最初に照らす字に当たったところ。
 * どこにも無い語は入らない。
 */
export function firstTermPlaces(
  terms: readonly ReportTerm[],
  leaves: readonly ReportOutlineLeaf[],
): ReadonlyMap<string, TermPlace> {
  const places = leaves.flatMap((leaf) =>
    citableTexts(leaf).map((text) => ({ leafId: leaf.id, text, match: termMatchText(text) })),
  )
  return new Map(
    terms.flatMap(({ term }) => {
      const place = places.find((candidate) => candidate.match.includes(term))
      return place === undefined ? [] : [[term, { leafId: place.leafId, text: place.text }]]
    }),
  )
}

/** 用語を照らす字。inline code・リンク・行内の印の中を除く。 */
function termMatchText(text: string): string {
  return textOutsideInlineMarks(text.replace(CODE_SPAN, GAP).replace(LINK, GAP))
}
