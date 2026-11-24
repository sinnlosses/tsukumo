import { describe, expect, it } from "vitest"

import {
  mapFocusFrameOf,
  mapLaneLayoutOf,
  mapPlacementOf,
} from "../../../../src/browser/features/architecture-map/architecture-map-placement.ts"
import type { MapView, MapViewBox } from "../../../../src/shared/architecture-map/map-view.ts"

function box(id: string, place?: { column: number; row: number }): MapViewBox {
  return {
    id,
    title: id,
    level: 1,
    external: false,
    hasChildren: false,
    paths: [],
    ...(place === undefined ? {} : { place }),
    problems: [],
  }
}

function viewOf(
  boxes: readonly MapViewBox[],
  edges: readonly (readonly [string, string])[],
): MapView {
  return {
    level: 1,
    boxes,
    edges: edges.map(([from, to]) => ({ from, to, count: 1, undeclared: false })),
    intendedEdges: [],
    closedCount: 0,
    findings: [],
  }
}

function laneBox(id: string, lane: string): MapViewBox {
  return { ...box(id, { column: 9, row: 9 }), lane }
}

function laneView(
  lanes: readonly { id: string; kind: "runtime" | "crosscut" | "external" }[],
  boxes: readonly MapViewBox[],
): MapView {
  return {
    ...viewOf(boxes, []),
    lanes: lanes.map((lane) => ({ ...lane, title: lane.id })),
  }
}

function lanesOf(view: MapView) {
  const layout = mapLaneLayoutOf(view)
  if (layout.kind !== "lanes") {
    throw new Error("区画を組まなかった")
  }
  return layout
}

function cellsOf(view: MapView) {
  return lanesOf(view).cells.map((cell) => ({
    id: cell.lane.id,
    column: cell.column,
    columnSpan: cell.columnSpan,
    row: cell.row,
    rowSpan: cell.rowSpan,
    boxIds: cell.boxIds,
    solo: cell.solo,
  }))
}

describe("mapLaneLayoutOf", () => {
  it("runtime と external を定義の順に列へ、crosscut を runtime の列の下の帯へ置き、範囲の外の external は2行を通す", () => {
    const view = laneView(
      [
        { id: "browser", kind: "runtime" },
        { id: "server", kind: "runtime" },
        { id: "external", kind: "external" },
        { id: "shared", kind: "crosscut" },
      ],
      [
        laneBox("cc", "external"),
        laneBox("plugins", "external"),
        laneBox("srv", "server"),
        laneBox("web", "browser"),
        laneBox("sh", "shared"),
      ],
    )

    expect(lanesOf(view).columns).toEqual(["runtime", "runtime", "external"])
    expect(cellsOf(view)).toEqual([
      { id: "browser", column: 0, columnSpan: 1, row: 0, rowSpan: 1, boxIds: ["web"], solo: true },
      { id: "server", column: 1, columnSpan: 1, row: 0, rowSpan: 1, boxIds: ["srv"], solo: true },
      {
        id: "external",
        column: 2,
        columnSpan: 1,
        row: 0,
        rowSpan: 2,
        boxIds: ["cc", "plugins"],
        solo: false,
      },
      { id: "shared", column: 0, columnSpan: 2, row: 1, rowSpan: 1, boxIds: ["sh"], solo: true },
    ])
  })

  it("帯の範囲の内にある external は列の行だけを占め、箱が2つ以上の runtime は枠になる", () => {
    const view = laneView(
      [
        { id: "a", kind: "runtime" },
        { id: "ext", kind: "external" },
        { id: "b", kind: "runtime" },
        { id: "band", kind: "crosscut" },
      ],
      [
        laneBox("a1", "a"),
        laneBox("a2", "a"),
        laneBox("e1", "ext"),
        laneBox("b1", "b"),
        laneBox("x", "band"),
      ],
    )

    const cells = cellsOf(view)

    expect(cells?.find((cell) => cell.id === "a")).toMatchObject({
      solo: false,
      boxIds: ["a1", "a2"],
    })
    expect(cells?.find((cell) => cell.id === "ext")).toMatchObject({ column: 1, rowSpan: 1 })
    expect(cells?.find((cell) => cell.id === "band")).toMatchObject({ column: 0, columnSpan: 3 })
  })

  it("runtime が無ければ帯は全部の列にまたがり、帯を2つ持てば上から順に重ねる", () => {
    const view = laneView(
      [
        { id: "e1", kind: "external" },
        { id: "e2", kind: "external" },
        { id: "top", kind: "crosscut" },
        { id: "bottom", kind: "crosscut" },
      ],
      [laneBox("x", "e1"), laneBox("y", "e2"), laneBox("t", "top"), laneBox("b", "bottom")],
    )

    const cells = cellsOf(view)

    expect(lanesOf(view).rowCount).toBe(3)
    expect(cells?.find((cell) => cell.id === "e1")).toMatchObject({ rowSpan: 1 })
    expect(cells?.find((cell) => cell.id === "top")).toMatchObject({
      row: 1,
      column: 0,
      columnSpan: 2,
    })
    expect(cells?.find((cell) => cell.id === "bottom")).toMatchObject({ row: 2, columnSpan: 2 })
  })

  it("区画の無い図・フォーカスした図・区画に属さない箱のある図・列の区画が無い図は格子のまま", () => {
    const lanes = [{ id: "r", kind: "runtime" as const }]
    const grid = { kind: "grid" }

    expect(mapLaneLayoutOf(viewOf([box("a")], []))).toEqual(grid)
    expect(
      mapLaneLayoutOf({
        ...laneView(lanes, [laneBox("a", "r")]),
        focus: { id: "a", title: "a", level: 1 },
      }),
    ).toEqual(grid)
    expect(mapLaneLayoutOf(laneView(lanes, [laneBox("a", "r"), box("b")]))).toEqual(grid)
    expect(mapLaneLayoutOf(laneView([{ id: "c", kind: "crosscut" }], [laneBox("a", "c")]))).toEqual(
      grid,
    )
  })
})

const FOCUS_LANES = [
  { id: "browser", title: "ブラウザ", kind: "runtime" },
  { id: "server", title: "サーバ", kind: "runtime" },
  { id: "external", title: "外部", kind: "external" },
] as const

function focusView(level: 1 | 2, focusLane?: string): MapView {
  const focusLevel = level === 1 ? 1 : 2
  const childLevel = level === 1 ? 2 : 3
  return {
    ...viewOf(
      [
        { ...box("ext-b"), level: focusLevel, lane: "external" },
        { ...box("child-1"), level: childLevel, lane: "server" },
        { ...box("peer"), level: focusLevel, lane: "browser" },
        { ...box("child-2"), level: childLevel, lane: "server" },
        { ...box("ext-a"), level: focusLevel, lane: "external" },
      ],
      [],
    ),
    level: childLevel,
    lanes: FOCUS_LANES,
    focus: {
      id: "server",
      title: "サーバ",
      level: focusLevel,
      ...(focusLane ? { lane: focusLane } : {}),
    },
  }
}

describe("mapFocusFrameOf", () => {
  it("子と外の箱を分け、外の箱を区画の定義の順（同じ区画は定義の順）に並べる", () => {
    expect(mapFocusFrameOf(focusView(1, "server"))).toEqual({
      kind: "frame",
      lane: FOCUS_LANES[1],
      title: "サーバ",
      childIds: ["child-1", "child-2"],
      outerIds: ["peer", "ext-b", "ext-a"],
    })
  })

  it("中の箱へのフォーカスでも外の箱を level で見分ける", () => {
    expect(mapFocusFrameOf(focusView(2, "server"))).toMatchObject({
      childIds: ["child-1", "child-2"],
      outerIds: ["peer", "ext-b", "ext-a"],
    })
  })

  it("全体の図・区画の無い図・フォーカスした箱の区画が並びに無い図は枠を組まない", () => {
    const { focus: _focus, ...overall } = focusView(1, "server")
    const { lanes: _lanes, ...unlaned } = focusView(1, "server")
    const none = { kind: "none" }

    expect(mapFocusFrameOf(overall)).toEqual(none)
    expect(mapFocusFrameOf(unlaned)).toEqual(none)
    expect(mapFocusFrameOf(focusView(1, "nowhere"))).toEqual(none)
    expect(mapFocusFrameOf(focusView(1))).toEqual(none)
  })
})

describe("mapPlacementOf", () => {
  it("全部の箱が place を持てば、その列と行のとおりに置く", () => {
    const view = viewOf(
      [box("a", { column: 2, row: 1 }), box("b", { column: 0, row: 0 })],
      [["a", "b"]],
    )

    expect([...mapPlacementOf(view)]).toEqual([
      ["a", { column: 2, row: 1 }],
      ["b", { column: 0, row: 0 }],
    ])
  })

  it("1つ欠けると自前の配置になり、エッジの向きで列、定義の順で行が決まる", () => {
    const view = viewOf(
      [box("a", { column: 5, row: 5 }), box("b"), box("c"), box("d")],
      [
        ["a", "b"],
        ["b", "c"],
        ["a", "c"],
      ],
    )

    const placement = mapPlacementOf(view)

    expect(placement.get("a")).toEqual({ column: 0, row: 0 })
    expect(placement.get("b")).toEqual({ column: 1, row: 0 })
    expect(placement.get("c")).toEqual({ column: 2, row: 0 })
    expect(placement.get("d")).toEqual({ column: 0, row: 1 })
  })

  it("同じ入力を2回渡すと同じ結果になる", () => {
    const view = viewOf(
      [box("a"), box("b"), box("c")],
      [
        ["b", "a"],
        ["c", "a"],
      ],
    )

    expect([...mapPlacementOf(view)]).toEqual([...mapPlacementOf(view)])
  })

  it("輪のある入力でも全部の箱に位置が付く", () => {
    const view = viewOf(
      [box("a"), box("b"), box("c")],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "a"],
        ["c", "c"],
      ],
    )

    const placement = mapPlacementOf(view)

    expect([...placement.keys()]).toEqual(["a", "b", "c"])
    expect(placement.get("c")).toEqual({ column: 2, row: 0 })
  })
})
