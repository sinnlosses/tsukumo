// レポート1件の用語の注の表。語ごとに、注と、点線を付ける初出の部品と欄の字を持つ。

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { drawnLeaves, reportOutline } from "../../../../shared/report/report-outline.ts"
import { firstTermPlaces, reportTermsOf } from "../../../../shared/report/report-term-place.ts"

export type TermNoteEntry = {
  readonly note: string
  readonly leafId: string
  /** 初出の欄の字。同じ部品の別の欄に点線を付けないよう、描く欄の字と照らす。 */
  readonly text: string
  /** 札の `id`。語の `aria-describedby` が指す。 */
  readonly cardId: string
}

/** 描く欄1つに付ける用語の注。語 → 注と札の `id`。 */
export type TermNotes = ReadonlyMap<string, Pick<TermNoteEntry, "note" | "cardId">>

/** 語 → 注と初出の場所。本文に無い語は入らない。 */
export type TermNoteTable = ReadonlyMap<string, TermNoteEntry>

/** `cardIdPrefix` はレポートごとに一意な語。同じ画面の別のレポートと札の `id` がぶつからないようにする。 */
export function termNoteTableOf(
  components: readonly A2uiReportComponent[],
  cardIdPrefix: string,
): TermNoteTable {
  const terms = reportTermsOf(components)
  const places = firstTermPlaces(terms, drawnLeaves(reportOutline(components)))
  return new Map(
    terms.flatMap((entry, index) => {
      const place = places.get(entry.term)
      return place === undefined
        ? []
        : [
            [
              entry.term,
              { note: entry.note, ...place, cardId: `${cardIdPrefix}-${String(index + 1)}` },
            ],
          ]
    }),
  )
}
