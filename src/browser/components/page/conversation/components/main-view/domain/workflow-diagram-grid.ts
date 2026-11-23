// ワークフローの図の格子（列の幅と、列を置く位置）。

import { columnKeysOf } from "./workflow-diagram-view.ts"
import type { WorkflowDiagram } from "./workflow-diagram.ts"

/** 段ごとの列の幅。範囲の箱が受け持つ段（2つ以上）は細く、ほかの段は広く幅を回す。 */
export function stepTracksOf(diagram: WorkflowDiagram): string {
  return diagram.columns
    .flatMap((column) => {
      const keys = columnKeysOf(column)
      return keys.map(() => (keys.length > 1 ? "minmax(0, 0.6fr)" : "minmax(0, 1.6fr)"))
    })
    .join(" ")
}

/**
 * 段の列の前に置く細い列。「着手」（あれば先頭）と「済んだ n フェーズ」か「畳む」。
 * `tracks` は格子の列の幅、`count` は譲る列の数、`foldedColumn` は「済んだ n フェーズ」の列の位置。
 */
export function leadOf(
  diagram: WorkflowDiagram,
  hasPrelude: boolean,
): { readonly tracks: string; readonly count: number; readonly foldedColumn: number } {
  const hasFolded = diagram.foldedPhases !== undefined || diagram.refoldable !== undefined
  return {
    tracks: `${hasPrelude ? "7rem " : ""}${hasFolded ? "6rem" : ""}`,
    count: (hasPrelude ? 1 : 0) + (hasFolded ? 1 : 0),
    foldedColumn: hasPrelude ? 2 : 1,
  }
}

/** 列の最初の段の格子の位置（1始まり。`leadCount` は先頭に譲った列の数）。 */
export function stepStartOf(diagram: WorkflowDiagram, position: number, leadCount: number): number {
  return (
    1 +
    leadCount +
    diagram.columns.slice(0, position).reduce((sum, column) => sum + columnKeysOf(column).length, 0)
  )
}
