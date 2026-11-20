// レポートの出典の番号の表を本文の行内の印へ渡す入れ物と、本文の末尾の「出典」の一覧。

import { createContext, use, type ReactElement, type ReactNode } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { citationTableOf, type CitationTable } from "../domain/citation-number.ts"
import styles from "../renderer/report-notation.module.css"

/** `outside` はレポートの外（出典の印を描かない）。 */
type CitationScopeValue =
  | { readonly kind: "outside" }
  | { readonly kind: "report"; readonly table: CitationTable }

const CitationContext = createContext<CitationScopeValue>({ kind: "outside" })

/** レポートの根で1回、番号の表を組んで本文を包む。 */
export function CitationScope(props: {
  readonly table: CitationTable
  readonly children: ReactNode
}): ReactElement {
  return (
    <CitationContext value={{ kind: "report", table: props.table }}>
      {props.children}
    </CitationContext>
  )
}

export function useCitationScope(): CitationScopeValue {
  return use(CitationContext)
}

/** `turnId` を行の `id` の頭に使い、同じ画面の別のレポートとぶつけない。 */
export function reportCitationTable(
  components: readonly A2uiReportComponent[],
  turnId: number,
): CitationTable {
  return citationTableOf(components, `report-source-${String(turnId)}`)
}

/** 番号の順の出典の一覧。表が空なら何も出さない。 */
export function CitationList(props: { readonly table: CitationTable }): ReactElement {
  const entries = [...props.table.values()]
  return (
    <>
      {entries.length > 0 && (
        <section className={styles["report-cite-list"]} aria-label="出典">
          <h4 className={styles["report-cite-list-heading"]}>出典</h4>
          <ol>
            {entries.map((entry) => (
              <li key={entry.rowId} id={entry.rowId}>
                <span className={styles["report-cite-list-number"]}>{entry.number}</span>
                <span>
                  <a href={entry.url} rel="noopener noreferrer">
                    {entry.title}
                  </a>
                  <span className={styles["report-cite-list-host"]}>{entry.host}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}
