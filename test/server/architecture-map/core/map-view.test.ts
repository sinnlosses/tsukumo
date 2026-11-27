import { describe, expect, it } from "vitest"

import { parseArchitectureMap } from "../../../../src/server/architecture-map/core/map-parse.ts"
import { mapViewOf } from "../../../../src/server/architecture-map/core/map-view.ts"
import type { ArchitectureMap } from "../../../../src/shared/architecture-map/architecture-map.ts"
import type { MapReady, MapView } from "../../../../src/shared/architecture-map/map-view.ts"
import { sampleLanedMap, sampleMap } from "../sample-map.ts"

function loadedMap(): ArchitectureMap {
  const parsed = parseArchitectureMap(JSON.stringify(sampleMap()))
  if (parsed.kind !== "map") {
    throw new Error("サンプルの地図が読めない")
  }
  return parsed.map
}

function viewOfLevel(level: 1 | 2 | 3): MapReady {
  const outcome = mapViewOf(loadedMap(), { kind: "level", level })
  if (outcome.kind !== "ready") {
    throw new Error("図が引けない")
  }
  return outcome
}

function viewOfFocus(box: string): MapView {
  const outcome = mapViewOf(loadedMap(), { kind: "focus", box })
  if (outcome.kind !== "ready") {
    throw new Error("図が引けない")
  }
  return outcome.view
}

const sum = (counts: readonly number[]) => counts.reduce((total, count) => total + count, 0)

/** 束ねた本数と閉じた本数の和が、小の段の実際のエッジの本数の和と等しいか。 */
function balanced(view: Pick<MapView, "edges" | "closedCount">, map: ArchitectureMap): boolean {
  return (
    sum(view.edges.map((edge) => edge.count)) + view.closedCount ===
    sum(map.edges.actual.map((edge) => edge.count))
  )
}

describe("mapViewOf の縮尺", () => {
  it("どの縮尺でも、束ねた本数と閉じた本数の和が小の段の実際のエッジの本数の和に等しい", () => {
    const map = loadedMap()

    for (const level of [1, 2, 3] as const) {
      expect(balanced(viewOfLevel(level).view, map), `縮尺 ${String(level)}`).toBe(true)
    }
  })

  it("束ねたエッジを1本落とした図では、等しさの検査が落ちる", () => {
    const map = loadedMap()
    const view = viewOfLevel(3).view

    expect(balanced({ ...view, edges: view.edges.slice(1) }, map)).toBe(false)
    expect(balanced({ ...view, closedCount: view.closedCount - 1 }, map)).toBe(false)
  })

  it("大の段は、大の箱とその間に束ねたエッジだけを返す", () => {
    const { view } = viewOfLevel(1)

    expect(view.boxes.map((box) => box.id)).toEqual(["app", "server", "vault"])
    expect(view.edges).toEqual([{ from: "app", to: "server", count: 4, undeclared: true }])
    expect(view.closedCount).toBe(5)
  })

  it("中の段は、中の箱どうしに束ね、同じ箱に閉じた本数を数える", () => {
    const { view } = viewOfLevel(2)

    expect(view.boxes.map((box) => box.id)).toEqual(["app/ui", "app/view", "server/store"])
    expect(view.edges).toEqual([
      { from: "app/ui", to: "app/view", count: 2, undeclared: false },
      { from: "app/view", to: "server/store", count: 4, undeclared: true },
    ])
    expect(view.closedCount).toBe(3)
  })

  it("概要は大の段の全体の図にだけ付く", () => {
    expect(viewOfLevel(1).overview).toBe(sampleMap().overview)
    expect(viewOfLevel(2)).not.toHaveProperty("overview")
  })

  it("意図したエッジは図の段に置き換え、図の段より粗い端のものは描かない", () => {
    expect(viewOfLevel(1).view.intendedEdges).toEqual([
      { from: "app", to: "server", label: "RPC", origin: "rule:app-to-server" },
      { from: "server", to: "vault" },
    ])
    expect(viewOfLevel(2).view.intendedEdges).toEqual([])
  })

  it("ずれを図の段の箱へ写し、描かない段の箱には付けない", () => {
    const large = viewOfLevel(1).view
    const medium = viewOfLevel(2).view

    expect(large.boxes.find((box) => box.id === "app")?.problems).toEqual(["undeclared-edge"])
    expect(large.boxes.find((box) => box.id === "server")?.problems).toEqual(["undeclared-edge"])
    expect(medium.boxes.find((box) => box.id === "app/ui")?.problems).toEqual(["empty-box"])
    expect(medium.boxes.find((box) => box.id === "app/view")?.problems).toEqual(["undeclared-edge"])
  })

  it("知らない種類のずれは名前だけで画面へ渡る", () => {
    expect(viewOfLevel(1).view.findings.at(-1)).toEqual({
      kind: "unknown",
      name: "future-kind",
      severity: "warn",
    })
  })
})

describe("mapViewOf の置き場", () => {
  it("箱に paths が載り、外の世界の箱は空になる", () => {
    const { view } = viewOfLevel(1)

    expect(view.boxes.find((box) => box.id === "app")?.paths).toEqual(["src/ui/**", "src/view/**"])
    expect(view.boxes.find((box) => box.id === "vault")?.paths).toEqual([])
  })

  it("子の数が childCount に載り、外の世界の箱には無い", () => {
    const { view } = viewOfLevel(1)

    expect(view.boxes.find((box) => box.id === "app")?.childCount).toBe(2)
    expect(view.boxes.find((box) => box.id === "vault")?.childCount).toBeUndefined()
  })

  it("entrypoints が箱に載り、欄の無い箱には無い", () => {
    const map = sampleMap()
    const boxes = map.boxes.map((box) =>
      box.id === "server" ? { ...box, entrypoints: ["src/server/store/index.ts"] } : box,
    )
    const parsed = parseArchitectureMap(JSON.stringify({ ...map, boxes }))
    const outcome =
      parsed.kind === "map" ? mapViewOf(parsed.map, { kind: "level", level: 1 }) : undefined
    const viewBoxes = outcome?.kind === "ready" ? outcome.view.boxes : []

    expect(viewBoxes.find((box) => box.id === "server")?.entrypoints).toEqual([
      "src/server/store/index.ts",
    ])
    expect(viewBoxes.find((box) => box.id === "app")).not.toHaveProperty("entrypoints")
  })

  it("中へのフォーカスで focus.summary が載る", () => {
    expect(viewOfFocus("app/view").focus?.summary).toBe("表示の判断")
  })
})

describe("mapViewOf のフォーカス", () => {
  it("フォーカスした箱の子と、子とつながる外の箱（同じ段の祖先）だけを返し、外の箱どうしのエッジは返さない", () => {
    const view = viewOfFocus("server")

    expect(view.focus).toEqual({
      id: "server",
      title: "server",
      summary: "手続きの側",
      level: 1,
    })
    expect(view.boxes.map((box) => box.id)).toEqual(["app", "server/store", "vault"])
    expect(view.edges).toEqual([{ from: "app", to: "server/store", count: 4, undeclared: true }])
    expect(view.intendedEdges).toEqual([{ from: "server/store", to: "vault" }])
  })

  it("別名でも引け、フォーカスした箱の中で閉じた本数を数える", () => {
    const view = viewOfFocus("frontend")

    expect(view.focus?.id).toBe("app")
    expect(view.boxes.map((box) => box.id)).toEqual(["app/ui", "app/view", "server"])
    expect(view.edges).toEqual([
      { from: "app/ui", to: "app/view", count: 2, undeclared: false },
      { from: "app/view", to: "server", count: 4, undeclared: true },
    ])
    expect(view.closedCount).toBe(3)
    expect(view.intendedEdges).toEqual([])
  })

  it("中の箱へのフォーカスは小の箱を出し、同じ段の外の箱へ置き換える", () => {
    const view = viewOfFocus("app/view")

    expect(view.boxes.map((box) => box.id)).toEqual(["app/ui", "src/view/core", "server/store"])
    expect(view.edges).toEqual([
      { from: "app/ui", to: "src/view/core", count: 2, undeclared: false },
      { from: "src/view/core", to: "server/store", count: 4, undeclared: false },
    ])
  })

  it("無い箱と、子を持たない箱は図にしない", () => {
    const map = loadedMap()

    expect(mapViewOf(map, { kind: "focus", box: "nowhere" })).toEqual({
      kind: "unfocusable",
      reason: "unknown-box",
    })
    expect(mapViewOf(map, { kind: "focus", box: "src/ui/part" })).toEqual({
      kind: "unfocusable",
      reason: "no-children",
    })
    expect(mapViewOf(map, { kind: "focus", box: "vault" })).toEqual({
      kind: "unfocusable",
      reason: "no-children",
    })
  })
})

describe("mapViewOf の区画", () => {
  function lanedView(selection: Parameters<typeof mapViewOf>[1]): MapView {
    const parsed = parseArchitectureMap(JSON.stringify(sampleLanedMap()))
    if (parsed.kind !== "map") {
      throw new Error("区画つきのサンプルの地図が読めない")
    }
    const outcome = mapViewOf(parsed.map, selection)
    if (outcome.kind !== "ready") {
      throw new Error("図が引けない")
    }
    return outcome.view
  }

  it("全体の図は区画の並び（title は無ければ id）と大の箱の区画を持つ", () => {
    const view = lanedView({ kind: "level", level: 1 })

    expect(view.lanes).toEqual([
      { id: "front", title: "表側", kind: "runtime" },
      { id: "back", title: "back", kind: "runtime" },
      { id: "outside", title: "外", kind: "external" },
    ])
    expect(view.boxes.map((box) => [box.id, box.lane])).toEqual([
      ["app", "front"],
      ["server", "back"],
      ["vault", "outside"],
    ])
  })

  it("フォーカスした図は、フォーカスした箱の区画と外の箱の区画を持つ", () => {
    const server = lanedView({ kind: "focus", box: "server" })
    const view = lanedView({ kind: "focus", box: "app/view" })

    expect(server.focus?.lane).toBe("back")
    expect(server.boxes.map((box) => [box.id, box.lane])).toEqual([
      ["app", "front"],
      ["server/store", "back"],
      ["vault", "outside"],
    ])
    expect(view.focus?.lane).toBe("front")
    expect(view.boxes.map((box) => [box.id, box.lane])).toEqual([
      ["app/ui", "front"],
      ["src/view/core", "front"],
      ["server/store", "back"],
    ])
  })

  it("区画の無い地図の図には lanes・lane の欄が無い", () => {
    const whole = viewOfLevel(1).view
    const focused = viewOfFocus("server")

    expect(whole).not.toHaveProperty("lanes")
    expect(focused.focus).not.toHaveProperty("lane")
    expect(whole.boxes.every((box) => !("lane" in box))).toBe(true)
    expect(focused.boxes.every((box) => !("lane" in box))).toBe(true)
  })
})

describe("mapViewOf のパスの畳み", () => {
  function foldedOf(boxId: string): readonly string[] | undefined {
    const parsed = parseArchitectureMap(
      JSON.stringify({
        version: 1,
        source: { producer: "sample-producer 0.0.1", commit: "0123abc" },
        boxes: [
          {
            id: "web",
            summary: "架空の画面",
            paths: ["lib/web/a/*", "lib/web/b/*", "lib/web/c/*"],
            children: [
              {
                id: "web/all",
                summary: "架空",
                paths: ["lib/web/a/*", "lib/web/b/*", "lib/web/c/*"],
                children: [
                  { id: "lib/web/a", paths: ["lib/web/a/*"] },
                  { id: "lib/web/b", paths: ["lib/web/b/*"] },
                  { id: "lib/web/c", paths: ["lib/web/c/*"] },
                ],
              },
            ],
          },
          {
            id: "core",
            summary: "架空の中核",
            paths: ["lib/core/*", "lib/main.ts", "tools/*", "tools/gen/*"],
            children: [
              {
                id: "core/all",
                summary: "架空",
                paths: ["lib/core/*", "lib/main.ts", "tools/*", "tools/gen/*"],
                children: [
                  { id: "lib/core", paths: ["lib/core/*"] },
                  { id: "tools", paths: ["tools/*"] },
                  { id: "tools/gen", paths: ["tools/gen/*"] },
                  { id: "lib/main.ts", paths: ["lib/main.ts"] },
                ],
              },
            ],
          },
        ],
        edges: { intended: [], actual: [] },
        findings: [],
      }),
    )
    if (parsed.kind !== "map") {
      throw new Error("架空の地図が読めない")
    }
    const outcome = mapViewOf(parsed.map, { kind: "level", level: 1 })
    if (outcome.kind !== "ready") {
      throw new Error("図が引けない")
    }
    return outcome.view.boxes.find((box) => box.id === boxId)?.foldedPaths
  }

  it("子孫だけを持つディレクトリへ遡り、1件の `<dir>/**` に畳む", () => {
    expect(foldedOf("web")).toEqual(["lib/web/**"])
  })

  it("別の箱が同居するディレクトリへは遡らず、そのディレクトリにあるファイル1つの glob はそのまま残す", () => {
    expect(foldedOf("core")).toEqual(["lib/core/**", "lib/main.ts", "tools/**"])
  })
})
