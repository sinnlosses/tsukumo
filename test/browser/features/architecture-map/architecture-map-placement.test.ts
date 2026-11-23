import { describe, expect, it } from "vitest"

import { mapPlacementOf } from "../../../../src/browser/features/architecture-map/architecture-map-placement.ts"
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
