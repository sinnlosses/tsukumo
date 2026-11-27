import { describe, expect, it } from "vitest"

import { parseArchitectureMap } from "../../../../src/server/architecture-map/core/map-parse.ts"
import { sampleLanedMap, sampleMap } from "../sample-map.ts"

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

describe("parseArchitectureMap の区画", () => {
  const offContract = { kind: "unreadable", reason: "off-contract" }

  it("区画のある地図は読め、区画の欄は残る", () => {
    const parsed = parse(sampleLanedMap())

    expect(parsed.kind).toBe("map")
    if (parsed.kind === "map") {
      expect(parsed.map.lanes?.map((lane) => lane.id)).toEqual(["front", "back", "outside"])
      expect(parsed.map.boxes[0]?.lane).toBe("front")
    }
  })

  it("lane の書き漏れは off-contract", () => {
    const map = sampleLanedMap()
    const boxes = map.boxes.map((box) => (box.id === "server" ? { ...box, lane: undefined } : box))

    expect(parse({ ...map, boxes })).toEqual(offContract)
  })

  it("lanes の無い地図に lane があれば off-contract", () => {
    expect(parse({ ...sampleLanedMap(), lanes: undefined })).toEqual(offContract)
  })

  it("存在しない区画を指せば off-contract", () => {
    const map = sampleLanedMap()
    const boxes = map.boxes.map((box) => (box.id === "server" ? { ...box, lane: "nowhere" } : box))

    expect(parse({ ...map, boxes })).toEqual(offContract)
  })

  it("external の食い違いは off-contract（外の箱を runtime へ、外でない箱を external へ）", () => {
    const map = sampleLanedMap()
    const vaultToRuntime = map.boxes.map((box) =>
      box.id === "vault" ? { ...box, lane: "back" } : box,
    )
    const serverToExternal = map.boxes.map((box) =>
      box.id === "server" ? { ...box, lane: "outside" } : box,
    )

    expect(parse({ ...map, boxes: vaultToRuntime })).toEqual(offContract)
    expect(parse({ ...map, boxes: serverToExternal })).toEqual(offContract)
  })

  it("大の箱が1つも属さない区画があれば off-contract", () => {
    const map = sampleLanedMap()

    expect(parse({ ...map, lanes: [...map.lanes, { id: "empty", kind: "runtime" }] })).toEqual(
      offContract,
    )
  })

  it("区画の id が重なれば off-contract", () => {
    const map = sampleLanedMap()

    expect(parse({ ...map, lanes: [...map.lanes, { id: "front", kind: "runtime" }] })).toEqual(
      offContract,
    )
  })
})

describe("parseArchitectureMap のエントリポイント", () => {
  const offContract = { kind: "unreadable", reason: "off-contract" }

  /** 大の箱 `extra` か中の箱 `extra/inner` か小の箱 `src/extra` の1つに entrypoints を書いた地図。 */
  function withEntrypoints(level: 1 | 2 | 3, entrypoints: unknown) {
    const small = { id: "src/extra", paths: ["src/extra/*"] }
    const medium = { id: "extra/inner", summary: "足した中の箱", paths: ["src/extra/**"] }
    return withExtraBox({
      ...(level === 1 ? { entrypoints } : {}),
      children: [
        {
          ...medium,
          ...(level === 2 ? { entrypoints } : {}),
          children: [{ ...small, ...(level === 3 ? { entrypoints } : {}) }],
        },
      ],
    })
  }

  it("大・中・小のどの段に書いても読め、欄が残る", () => {
    const entrypoints = ["src/extra/index.ts", "src/extra/main.ts"]

    for (const level of [1, 2, 3] as const) {
      const parsed = parse(withEntrypoints(level, entrypoints))
      expect(parsed.kind).toBe("map")
      if (parsed.kind === "map") {
        const large = parsed.map.boxes.find((box) => box.id === "extra")
        const medium = large?.children?.[0]
        const written = [large, medium, medium?.children[0]][level - 1]
        expect(written?.entrypoints).toEqual(entrypoints)
      }
    }
  })

  it("欄の無い地図は今のまま読め、欄が無い", () => {
    const parsed = parse(sampleMap())

    expect(parsed.kind).toBe("map")
    if (parsed.kind === "map") {
      expect(parsed.map.boxes.every((box) => box.entrypoints === undefined)).toBe(true)
    }
  })

  it.each([
    ["空の配列", []],
    ["* を含む", ["src/extra/*.ts"]],
    ["./ で始まる", ["./src/extra/index.ts"]],
  ])("%s は off-contract", (_name, entrypoints) => {
    expect(parse(withEntrypoints(3, entrypoints))).toEqual(offContract)
  })

  it("外の世界の箱に書けば off-contract", () => {
    const map = sampleMap()
    const boxes = map.boxes.map((box) =>
      box.id === "vault" ? { ...box, entrypoints: ["vault/index.ts"] } : box,
    )

    expect(parse({ ...map, boxes })).toEqual(offContract)
  })
})
