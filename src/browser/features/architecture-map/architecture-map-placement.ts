// 地図の図の箱を格子に置く。純粋で、同じ入力なら同じ結果になる。
// 図の箱が全部 `place` を持てばそのとおり、1つでも欠ければエッジの向きで列・定義の順で行を決める。
// 区画のある全体の図は `place` を使わず、区画の組み方（列・帯・外部の列の縦の通し）で置く。

import type { MapView, MapViewLane } from "../../../shared/architecture-map/map-view.ts"

export type MapGridPlace = { readonly column: number; readonly row: number }

/** 区画の組み方の格子の1区画。行0は列の行、行1からは帯の行。 */
export type MapLaneCell = {
  readonly lane: MapViewLane
  readonly column: number
  readonly columnSpan: number
  readonly row: number
  readonly rowSpan: number
  /** 区画に属する大の箱の ID（定義の順）。 */
  readonly boxIds: readonly string[]
  /** 区画そのものがその1つの箱になる。 */
  readonly solo: boolean
}

/** `grid` は区画を組まない図（呼ぶ側は `mapPlacementOf` の格子で描く）。 */
export type MapLaneLayout =
  | { readonly kind: "grid" }
  | {
      readonly kind: "lanes"
      /** 左からの列の種類。 */
      readonly columns: readonly ("runtime" | "external")[]
      readonly rowCount: number
      readonly cells: readonly MapLaneCell[]
    }

/**
 * 区画のある全体の図の組み方。フォーカスした図・区画の無い図・区画に属さない箱のある図・
 * 列になる区画が1つも無い図は `grid`。
 */
export function mapLaneLayoutOf(view: MapView): MapLaneLayout {
  const lanes = view.lanes ?? []
  const known = new Set(lanes.map((lane) => lane.id))
  const columnLanes = lanes.filter((lane) => lane.kind !== "crosscut")
  if (
    view.focus !== undefined ||
    columnLanes.length === 0 ||
    !view.boxes.every((box) => box.lane !== undefined && known.has(box.lane))
  ) {
    return { kind: "grid" }
  }
  const bands = lanes.filter((lane) => lane.kind === "crosscut")
  const runtimeColumns = columnLanes.flatMap((lane, column) =>
    lane.kind === "runtime" ? [column] : [],
  )
  const spanStart = runtimeColumns.length === 0 ? 0 : Math.min(...runtimeColumns)
  const spanEnd = runtimeColumns.length === 0 ? columnLanes.length - 1 : Math.max(...runtimeColumns)
  const rowCount = 1 + bands.length
  const boxIdsOf = (lane: MapViewLane) =>
    view.boxes.filter((box) => box.lane === lane.id).map((box) => box.id)
  const cellOf = (
    lane: MapViewLane,
    place: Omit<MapLaneCell, "lane" | "boxIds" | "solo">,
  ): MapLaneCell => {
    const boxIds = boxIdsOf(lane)
    return { lane, ...place, boxIds, solo: lane.kind !== "external" && boxIds.length === 1 }
  }
  const columnCells = columnLanes.map((lane, column) => {
    const outsideBands = column < spanStart || column > spanEnd
    return cellOf(lane, {
      column,
      columnSpan: 1,
      row: 0,
      rowSpan: lane.kind === "external" && outsideBands ? rowCount : 1,
    })
  })
  const bandCells = bands.map((lane, index) =>
    cellOf(lane, {
      column: spanStart,
      columnSpan: Math.max(1, spanEnd - spanStart + 1),
      row: 1 + index,
      rowSpan: 1,
    }),
  )
  return {
    kind: "lanes",
    columns: columnLanes.map((lane) => (lane.kind === "runtime" ? "runtime" : "external")),
    rowCount,
    cells: [...columnCells, ...bandCells],
  }
}

/** 区画のある地図のフォーカスした図の組み方。 */
export type MapFocusFrame =
  | { readonly kind: "none" }
  | {
      readonly kind: "frame"
      /** 枠の色になる、フォーカスした箱の区画。 */
      readonly lane: MapViewLane
      readonly title: string
      /** 枠の中に並べる子の ID（定義の順）。 */
      readonly childIds: readonly string[]
      /** 枠の外の右に並べる、子とつながる外の箱の ID（区画の定義の順、同じ区画は定義の順）。 */
      readonly outerIds: readonly string[]
    }

/**
 * 区画のある地図のフォーカスした図の、枠と外の箱の分け方。
 * フォーカスしていない図・区画の無い図・フォーカスした箱の区画が区画の並びに無い図は `none`
 * （呼ぶ側は `mapPlacementOf` の格子で描く）。
 */
export function mapFocusFrameOf(view: MapView): MapFocusFrame {
  const lanes = view.lanes ?? []
  const lane = lanes.find((candidate) => candidate.id === view.focus?.lane)
  if (view.focus === undefined || lane === undefined) {
    return { kind: "none" }
  }
  const { level, title } = view.focus
  const laneOrder = (box: MapView["boxes"][number]) => {
    const index = lanes.findIndex((candidate) => candidate.id === box.lane)
    return index === -1 ? lanes.length : index
  }
  const outer = view.boxes.filter((box) => box.level === level)
  return {
    kind: "frame",
    lane,
    title,
    childIds: view.boxes.filter((box) => box.level !== level).map((box) => box.id),
    outerIds: outer.toSorted((a, b) => laneOrder(a) - laneOrder(b)).map((box) => box.id),
  }
}

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
