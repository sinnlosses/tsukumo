// レポートの用語の注の表を、初出の部品の行内の記法へ渡す入れ物。
// 根で表を、部品ごとにその部品の id を持たせ、描く欄の字が初出の組に一致する語だけを読ませる。

import { createContext, use, type ReactElement, type ReactNode } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { type TermNotes, type TermNoteTable, termNoteTableOf } from "../domain/term-note.ts"

const EMPTY_TABLE: TermNoteTable = new Map()

const TableContext = createContext<TermNoteTable>(EMPTY_TABLE)

/** `outside` は内容部品の外（注を付けない）。 */
type LeafScopeValue = { readonly kind: "outside" } | { readonly kind: "leaf"; readonly id: string }

const LeafContext = createContext<LeafScopeValue>({ kind: "outside" })

/** レポートの根で1回組んだ表で本文を包む。 */
export function TermNoteScope(props: {
  readonly table: TermNoteTable
  readonly children: ReactNode
}): ReactElement {
  return <TableContext value={props.table}>{props.children}</TableContext>
}

/** 内容部品1つを、その部品の id で包む。 */
export function TermNoteLeafScope(props: {
  readonly leafId: string
  readonly children: ReactNode
}): ReactElement {
  return <LeafContext value={{ kind: "leaf", id: props.leafId }}>{props.children}</LeafContext>
}

/** 今の部品の欄 `text` が初出の場所になっている語の注。レポートか部品の外では空。 */
export function useTermNotesFor(text: string): TermNotes {
  const table = use(TableContext)
  const leaf = use(LeafContext)
  return new Map(
    [...table].flatMap(([term, entry]) =>
      leaf.kind === "leaf" && entry.leafId === leaf.id && entry.text === text
        ? [[term, { note: entry.note, cardId: entry.cardId }]]
        : [],
    ),
  )
}

/** `turnId` を札の `id` の頭に使い、同じ画面の別のレポートとぶつけない。 */
export function reportTermNoteTable(
  components: readonly A2uiReportComponent[],
  turnId: number,
): TermNoteTable {
  return termNoteTableOf(components, `report-term-${String(turnId)}`)
}
