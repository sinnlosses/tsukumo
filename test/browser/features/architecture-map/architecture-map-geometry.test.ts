import { describe, expect, it } from "vitest"

import { mapGeometryOf } from "../../../../src/browser/features/architecture-map/architecture-map-geometry.ts"
import type { MapView, MapViewBox } from "../../../../src/shared/architecture-map/map-view.ts"

function box(id: string, title: string, extra: Partial<MapViewBox> = {}): MapViewBox {
  return {
    id,
    title,
    level: 1,
    external: false,
    hasChildren: false,
    paths: [],
    problems: [],
    ...extra,
  }
}

function viewOf(boxes: readonly MapViewBox[], lanes?: MapView["lanes"]): MapView {
  return {
    level: 1,
    ...(lanes === undefined ? {} : { lanes }),
    boxes,
    edges: [],
    intendedEdges: [],
    closedCount: 0,
    findings: [],
  }
}

const TSUKUMO_LIKE = viewOf(
  [
    box("claude-code", "Claude Code", { external: true, lane: "external" }),
    box("tsukumo-plugins", "tsukumo-plugins", { external: true, lane: "external" }),
    box("character-pack", "キャラクターパック", { external: true, lane: "external" }),
    box("server", "サーバ", { lane: "server" }),
    box("browser", "ブラウザ", { lane: "browser" }),
    box("shared", "共有層", { lane: "shared" }),
  ],
  [
    { id: "browser", title: "ブラウザ", kind: "runtime" },
    { id: "server", title: "サーバ", kind: "runtime" },
    { id: "external", title: "外部", kind: "external" },
    { id: "shared", title: "共有層", kind: "crosscut" },
  ],
)

describe("mapGeometryOf", () => {
  it("区画の無い図は今の格子の座標で置き、区画の枠を持たない", () => {
    const view = viewOf([
      box("a", "a", { place: { column: 0, row: 0 } }),
      box("b", "b", { place: { column: 1, row: 0 } }),
    ])

    const geometry = mapGeometryOf(view, "mini")

    expect(geometry.lanes).toBeUndefined()
    expect(geometry.rects.get("b")).toEqual({ id: "b", x: 112, y: 12, width: 84, height: 22 })
    expect([geometry.width, geometry.height]).toEqual([208, 46])
  })

  it("区画の箱は区画そのものの座標を持ち、帯はブラウザとサーバの2列にまたがる", () => {
    const geometry = mapGeometryOf(TSUKUMO_LIKE, "mini")
    const browser = geometry.rects.get("browser")
    const server = geometry.rects.get("server")
    const shared = geometry.rects.get("shared")

    expect(browser).toMatchObject({ x: 4, y: 4, width: 66 })
    expect(server).toMatchObject({ x: 76, y: 4, width: 66 })
    expect(shared).toMatchObject({ x: 4, width: 138 })
    expect(shared?.y).toBeCloseTo((browser?.y ?? 0) + (browser?.height ?? 0) + 6)
    expect(geometry.width).toBe(238)
  })

  it("外部の列は列の行と帯の行を縦に通し、中の箱は定義の順に上から並ぶ", () => {
    const geometry = mapGeometryOf(TSUKUMO_LIKE, "mini")
    const external = geometry.lanes?.rects.find((lane) => lane.lane.id === "external")
    const shared = geometry.rects.get("shared")
    const top = geometry.rects.get("claude-code")
    const middle = geometry.rects.get("tsukumo-plugins")
    const bottom = geometry.rects.get("character-pack")

    expect(external).toMatchObject({ x: 148, y: 4, width: 86, solo: false })
    expect((external?.y ?? 0) + (external?.height ?? 0)).toBeCloseTo(
      (shared?.y ?? 0) + (shared?.height ?? 0),
    )
    expect(top).toMatchObject({ x: 153, y: 20, width: 76 })
    expect(middle?.y).toBeGreaterThan((top?.y ?? 0) + (top?.height ?? 0))
    expect(bottom?.y).toBeGreaterThan((middle?.y ?? 0) + (middle?.height ?? 0))
    expect((bottom?.y ?? 0) + (bottom?.height ?? 0)).toBeLessThanOrEqual(
      (external?.y ?? 0) + (external?.height ?? 0),
    )
  })

  it("サイドバーの幅の外部の箱の名前は2行に折れる", () => {
    const titles = mapGeometryOf(TSUKUMO_LIKE, "mini").lanes?.titles

    expect(titles?.get("tsukumo-plugins")?.lines).toEqual(["tsukumo-", "plugins"])
    expect(titles?.get("character-pack")?.lines).toEqual(["キャラク", "ターパック"])
    expect(titles?.get("claude-code")?.lines).toEqual(["Claude", "Code"])
    expect(titles?.get("browser")).toMatchObject({ lines: ["ブラウザ"], solo: true })
  })

  it("レポートの幅の外部の箱の名前は1行に収まり、区画の箱の名前は 14 で描く", () => {
    const titles = mapGeometryOf(TSUKUMO_LIKE, "report").lanes?.titles

    expect(titles?.get("tsukumo-plugins")?.lines).toEqual(["tsukumo-plugins"])
    expect(titles?.get("character-pack")?.lines).toEqual(["キャラクターパック"])
    expect(titles?.get("browser")).toMatchObject({ fontSize: 14, solo: true })
  })

  it("2行に収まらないときだけ末尾を「…」で切る", () => {
    const view = viewOf(
      [
        box("fits", "あいうえおかきくけこ", { external: true, lane: "external" }),
        box("over", "あいうえおかきくけこさ", { external: true, lane: "external" }),
        box("server", "サーバ", { lane: "server" }),
      ],
      [
        { id: "server", title: "サーバ", kind: "runtime" },
        { id: "external", title: "外部", kind: "external" },
      ],
    )

    const titles = mapGeometryOf(view, "mini").lanes?.titles

    expect(titles?.get("fits")?.lines).toEqual(["あいうえお", "かきくけこ"])
    expect(titles?.get("over")?.lines).toEqual(["あいうえお", "かきくけ…"])
  })

  describe("区画のある地図のフォーカスした図", () => {
    const focusView = (laned: boolean): MapView => ({
      ...viewOf(
        [
          box("a", "子A", { level: 2, lane: "server", place: { column: 0, row: 0 } }),
          box("b", "子B", { level: 2, lane: "server", place: { column: 1, row: 0 } }),
          box("peer", "ブラウザ", { lane: "browser" }),
          box("ext", "外部の箱", { lane: "external", external: true }),
        ],
        laned
          ? [
              { id: "browser", title: "ブラウザ", kind: "runtime" },
              { id: "server", title: "サーバ", kind: "runtime" },
              { id: "external", title: "外部", kind: "external" },
            ]
          : undefined,
      ),
      level: 2,
      focus: { id: "server", title: "サーバ", level: 1, lane: "server" },
    })

    it.each(["full", "mini"] as const)(
      "%s は枠が子だけを囲み、外の箱は枠の右に1列で並ぶ",
      (form) => {
        const geometry = mapGeometryOf(focusView(true), form)
        const frame = geometry.focusFrame
        const rect = frame?.rect ?? { x: 0, y: 0, width: 0, height: 0 }
        const right = rect.x + rect.width
        const peer = geometry.rects.get("peer")
        const ext = geometry.rects.get("ext")

        expect(frame?.lane.id).toBe("server")
        expect(frame?.heading.text).toBe("サーバの中")
        for (const id of ["a", "b"]) {
          const child = geometry.rects.get(id)
          expect(child?.x).toBeGreaterThanOrEqual(rect.x)
          expect((child?.x ?? 0) + (child?.width ?? 0)).toBeLessThanOrEqual(right)
          expect(child?.y).toBeGreaterThanOrEqual(rect.y + (frame?.heading.height ?? 0))
          expect((child?.y ?? 0) + (child?.height ?? 0)).toBeLessThanOrEqual(rect.y + rect.height)
        }
        expect(peer?.x).toBeGreaterThan(right)
        expect(ext?.x).toBe(peer?.x)
        expect(ext?.y).toBeGreaterThan(peer?.y ?? 0)
        expect(peer?.y).toBe(rect.y)
        expect(geometry.outerIds).toEqual(new Set(["peer", "ext"]))
        expect(geometry.width).toBe((ext?.x ?? 0) + (ext?.width ?? 0) + (form === "mini" ? 4 : 12))
      },
    )

    it("区画の無い地図のフォーカスした図は今の格子の座標のまま枠を持たない", () => {
      const placed = focusView(false)
      const geometry = mapGeometryOf(
        {
          ...placed,
          boxes: placed.boxes.map((item, index) => ({
            ...item,
            place: { column: index === 1 ? 1 : 0, row: index === 1 ? 0 : index },
          })),
        },
        "mini",
      )

      expect(geometry.focusFrame).toBeUndefined()
      expect(geometry.outerIds).toBeUndefined()
      expect(geometry.rects.get("b")).toEqual({
        id: "b",
        x: 12 + 1 * (84 + 16),
        y: 12,
        width: 84,
        height: 22,
      })
    })
  })
})
