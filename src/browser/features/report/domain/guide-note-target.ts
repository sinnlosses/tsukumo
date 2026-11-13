// 書き手が渡した案内の付箋を、紙に描くものへ絞り、指された場所を紙の上の置き場へ解く。
// 描くのは先頭3つまで。置き場が紙に無い `target`（描いていない部品・紙に無い欄）は、別の場所へ落とさず描かない。

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { a2uiLeafIds } from "../../../../shared/report/a2ui-report-outline.ts"
import type { ReportGuideNote } from "../../../../shared/report/report-progress-field.ts"

/** 描く付箋の数の上限。書き手との約束で、書き手側の検査（`MAX_GUIDE_NOTES`）と同じ値。 */
const MAX_DRAWN_GUIDE_NOTES = 3

/** 紙の欄のうち、付箋の指し先にできるもの。`data-report-region="head"`・`data-paper-part` に対応する。 */
export type GuideNoteField = "head" | "ledger" | "figures"

export type GuideNotePlace =
  | { readonly kind: "component"; readonly id: string }
  | { readonly kind: "field"; readonly field: GuideNoteField }

export type DrawnGuideNote = {
  readonly text: string
  readonly place: GuideNotePlace
}

/** 紙が今描いている場所。ここに無い `target` の付箋は描かない。 */
export type GuideNoteTargets = {
  readonly componentIds: ReadonlySet<string>
  readonly fields: ReadonlySet<GuideNoteField>
}

/** 部品の ID の先で、付箋を置く内容部品の ID（0個か1個）。節や配置の部品は、中の最初の内容部品に解く（Markdown は外枠を持たないので飛ばす）。 */
export function guideLeafIdsOf(
  parts: ReadonlyMap<string, A2uiReportComponent>,
  componentId: string,
): readonly string[] {
  return a2uiLeafIds([componentId], parts)
    .filter((id) => parts.get(id)?.component !== "Markdown")
    .slice(0, 1)
}

/** 書き手が `target` に書く `report` の欄の名前と、その欄を描く紙の欄。 */
const FIELD_OF_ARGUMENT = new Map<string, GuideNoteField>([
  ["conclusion", "head"],
  ["checks", "ledger"],
  ["keyFigures", "figures"],
])

export function drawnGuideNotes(
  notes: readonly ReportGuideNote[],
  targets: GuideNoteTargets,
): readonly DrawnGuideNote[] {
  return notes.slice(0, MAX_DRAWN_GUIDE_NOTES).flatMap((note): readonly DrawnGuideNote[] => {
    if (targets.componentIds.has(note.target)) {
      return [{ text: note.text, place: { kind: "component", id: note.target } }]
    }
    const field = FIELD_OF_ARGUMENT.get(note.target)
    if (field !== undefined && targets.fields.has(field)) {
      return [{ text: note.text, place: { kind: "field", field } }]
    }
    return []
  })
}
