// 地図の図の箱を格子に置く。純粋で、同じ入力なら同じ結果になる。
// 図の箱が全部 `place` を持てばそのとおり、1つでも欠ければエッジの向きで列・定義の順で行を決める。

import type { MapView } from "../../../shared/architecture-map/map-view.ts"

export type MapGridPlace = { readonly column: number; readonly row: number }

export function mapPlacementOf(view: MapView): ReadonlyMap<string, MapGridPlace> {
  const placed = view.boxes.flatMap((box) =>
    box.place === undefined ? [] : [[box.id, box.place] as const],
  )
  if (placed.length === view.boxes.length) {
    return new Map(placed)
  }
  return layoutByEdges(view)
}

function layoutByEdges(view: MapView): ReadonlyMap<string, MapGridPlace> {
  const ids = view.boxes.map((box) => box.id)
  const known = new Set(ids)
  const successors = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const edge of [...view.edges, ...view.intendedEdges]) {
    if (known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to) {
      successors.get(edge.from)?.push(edge.to)
    }
  }
  const forward = withoutBackEdges(ids, successors)
  const predecessors = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const [from, tos] of forward) {
    for (const to of tos) {
      predecessors.get(to)?.push(from)
    }
  }
  const depths = new Map<string, number>()
  const depthOf = (id: string): number => {
    const cached = depths.get(id)
    if (cached !== undefined) {
      return cached
    }
    const depth = Math.max(-1, ...(predecessors.get(id) ?? []).map(depthOf)) + 1
    depths.set(id, depth)
    return depth
  }
  const rows = new Map<number, number>()
  return new Map(
    ids.map((id) => {
      const column = depthOf(id)
      const row = rows.get(column) ?? 0
      rows.set(column, row + 1)
      return [id, { column, row }] as const
    }),
  )
}

/** 定義の順に深さ優先で辿り、辿っている途中の箱へ戻る辺（輪を作る辺）を断った辺の表。 */
function withoutBackEdges(
  ids: readonly string[],
  successors: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, readonly string[]> {
  const state = new Map<string, "visiting" | "done">()
  const kept = new Map<string, string[]>(ids.map((id) => [id, []]))
  const visit = (id: string) => {
    state.set(id, "visiting")
    for (const next of successors.get(id) ?? []) {
      const nextState = state.get(next)
      if (nextState === "visiting") {
        continue
      }
      kept.get(id)?.push(next)
      if (nextState === undefined) {
        visit(next)
      }
    }
    state.set(id, "done")
  }
  for (const id of ids) {
    if (!state.has(id)) {
      visit(id)
    }
  }
  return kept
}
