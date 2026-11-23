import { describe, expect, it } from "vitest"

import { parseArchitectureMap } from "../../../../src/server/architecture-map/core/map-parse.ts"
import { sampleMap } from "../sample-map.ts"

const parse = (value: unknown) => parseArchitectureMap(JSON.stringify(value))

/** 大の箱を1つ足した地図。`patch` は足した大の箱の欄を上書きする。 */
function withExtraBox(patch: Readonly<Record<string, unknown>>) {
  const map = sampleMap()
  const extra = {
    id: "extra",
    summary: "足した箱",
    paths: ["src/extra/**"],
    children: [
      {
        id: "extra/inner",
        summary: "足した中の箱",
        paths: ["src/extra/**"],
        children: [{ id: "src/extra", paths: ["src/extra/*"] }],
      },
    ],
    ...patch,
  }
  return { ...map, boxes: [...map.boxes, extra] }
}

describe("parseArchitectureMap", () => {
  it("正しいファイルは地図として読み、知らない欄は捨て、知らない種類のずれは名前だけ残す", () => {
    const parsed = parse(sampleMap())

    expect(parsed.kind).toBe("map")
    if (parsed.kind === "map") {
      expect(parsed.map).not.toHaveProperty("extraField")
      expect(parsed.map.findings.at(-1)).toEqual({
        kind: "unknown",
        name: "future-kind",
        severity: "warn",
      })
      expect(parsed.map.boxes[0]?.purpose).toBe("画面を手続きの実装から隔てる")
    }
  })

  it("JSON でない中身は not-json、オブジェクトでない JSON は off-contract", () => {
    expect(parseArchitectureMap("{ broken")).toEqual({ kind: "unreadable", reason: "not-json" })
    expect(parseArchitectureMap("[]")).toEqual({ kind: "unreadable", reason: "off-contract" })
  })

  it("必須の欄が欠けたら off-contract", () => {
    const { source: _source, ...withoutSource } = sampleMap()

    expect(parse(withoutSource)).toEqual({ kind: "unreadable", reason: "off-contract" })
  })

  it("箱の ID の形が外れたら off-contract", () => {
    for (const id of ["a b", "..", "a/../b", "a//b", "x".repeat(101), "a{b}"]) {
      expect(parse(withExtraBox({ id })), id).toEqual({
        kind: "unreadable",
        reason: "off-contract",
      })
    }
    expect(parse(withExtraBox({ id: ".hidden/a.b-c_d" })).kind).toBe("map")
  })

  it("ID と別名が重なったら off-contract", () => {
    expect(parse(withExtraBox({ id: "frontend" }))).toEqual({
      kind: "unreadable",
      reason: "off-contract",
    })
    expect(parse(withExtraBox({ aliases: ["server"] }))).toEqual({
      kind: "unreadable",
      reason: "off-contract",
    })
  })

  it("paths の書き方が外れたら off-contract", () => {
    for (const glob of ["./src/a/*", "/src/a/*", "src/{a,b}/*", "src/?/*", "!src/a", "src//a"]) {
      expect(parse(withExtraBox({ paths: [glob] })), glob).toEqual({
        kind: "unreadable",
        reason: "off-contract",
      })
    }
    expect(parse(withExtraBox({ paths: ["src/.hidden/*", "a/**/b"] })).kind).toBe("map")
  })

  it("エッジの端が今の ID の箱を指さなければ off-contract（別名・無い箱・小でない箱）", () => {
    const base = sampleMap()
    const withActual = (edge: { from: string; to: string; count: number }) => ({
      ...base,
      edges: { ...base.edges, actual: [...base.edges.actual, edge] },
    })
    const aliased = {
      ...base,
      edges: {
        ...base.edges,
        intended: [...base.edges.intended, { from: "frontend", to: "server" }],
      },
    }
    const missing = withActual({ from: "src/ui/page", to: "src/nowhere", count: 1 })
    const notSmall = withActual({ from: "app/ui", to: "src/ui/page", count: 1 })

    for (const map of [aliased, missing, notSmall]) {
      expect(parse(map)).toEqual({ kind: "unreadable", reason: "off-contract" })
    }
  })

  it("版が 1 より大きければ、ほかの欄が契約に沿わなくても newer-version", () => {
    expect(parse({ ...sampleMap(), version: 2 })).toEqual({
      kind: "unreadable",
      reason: "newer-version",
    })
    expect(parse({ version: 2, boxes: "未来の形" })).toEqual({
      kind: "unreadable",
      reason: "newer-version",
    })
  })

  it("版が 1 でも整数でもなければ off-contract", () => {
    expect(parse({ ...sampleMap(), version: 0 })).toEqual({
      kind: "unreadable",
      reason: "off-contract",
    })
    expect(parse({ ...sampleMap(), version: 1.5 })).toEqual({
      kind: "unreadable",
      reason: "off-contract",
    })
  })
})
