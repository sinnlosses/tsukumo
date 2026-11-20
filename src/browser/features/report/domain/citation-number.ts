// レポート1件の出典の番号の表。本文の置ける欄で初めて指された順に 1 から振る。

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { citedSourceIds, reportSourcesOf } from "../../../../shared/report/report-citation.ts"
import { drawnLeaves, reportOutline } from "../../../../shared/report/report-outline.ts"

export type CitationEntry = {
  readonly number: number
  readonly title: string
  /** URL のホスト名。札と一覧に出す。 */
  readonly host: string
  readonly url: string
  /** 末尾の一覧の行の `id`。バッジの行き先。 */
  readonly rowId: string
}

/** 出典の id → 番号・題・ホスト名。指されていない出典と `sources` に無い id は入らない。 */
export type CitationTable = ReadonlyMap<string, CitationEntry>

/** `rowIdPrefix` はレポートごとに一意な語。同じ画面の別のレポートと行の `id` がぶつからないようにする。 */
export function citationTableOf(
  components: readonly A2uiReportComponent[],
  rowIdPrefix: string,
): CitationTable {
  const sources = reportSourcesOf(components)
  const listed = citedSourceIds(drawnLeaves(reportOutline(components))).flatMap((id) =>
    sources.filter((source) => source.id === id).slice(0, 1),
  )
  return new Map(
    listed.map((source, index) => [
      source.id,
      {
        number: index + 1,
        title: source.title,
        host: URL.parse(source.url)?.hostname ?? "",
        url: source.url,
        rowId: `${rowIdPrefix}-${source.id}`,
      },
    ]),
  )
}
