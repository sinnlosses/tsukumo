import { matchesGlob } from "node:path"

import { describe, expect, it } from "vitest"

import { parseArchitectureMap } from "../../../../src/server/architecture-map/core/map-parse.ts"
import { reportMapOf } from "../../../../src/server/architecture-map/core/report-map.ts"
import type { ArchitectureMap } from "../../../../src/shared/architecture-map/architecture-map.ts"
import type { ChangedFile } from "../../../../src/shared/report/changed-file.ts"
import { sampleMap } from "../sample-map.ts"

function loadedMap(tree?: string): ArchitectureMap {
  const sample = sampleMap()
  const parsed = parseArchitectureMap(
    JSON.stringify({
      ...sample,
      source: { ...sample.source, ...(tree === undefined ? {} : { tree }) },
    }),
  )
  if (parsed.kind !== "map") {
    throw new Error("サンプルの地図が読めない")
  }
  return parsed.map
}

const KNOWN = { kind: "known", sha: "tree-aaaa" } as const

const modified = (path: string): ChangedFile => ({ path, change: "modified" })

/** 地図の小の箱の `paths` から、当たるファイルを1つずつ作る。 */
const MATCHING = [
  "src/ui/part/button.ts",
  "src/ui/page/home.ts",
  "src/view/core/model.ts",
  "src/server/store/db.ts",
]

describe("reportMapOf の箱への当て方", () => {
  it("箱の paths に当たる変えたファイルが、全部どれかの箱に入り、最も深い箱と祖先が大から小の順に並ぶ", () => {
    const map = reportMapOf(loadedMap(), MATCHING.map(modified), KNOWN, matchesGlob)

    expect(map.files.map((file) => file.path)).toEqual(MATCHING)
    expect(map.files.map((file) => file.boxes)).toEqual([
      ["app", "app/ui", "src/ui/part"],
      ["app", "app/ui", "src/ui/page"],
      ["app", "app/view", "src/view/core"],
      ["server", "server/store", "src/server/store"],
    ])
  })

  it("どの箱にも当たらないファイルは入らない", () => {
    const map = reportMapOf(
      loadedMap(),
      [modified("outside/readme.txt"), modified("src/ui/part/a.ts")],
      KNOWN,
      matchesGlob,
    )

    expect(map.files.map((file) => file.path)).toEqual(["src/ui/part/a.ts"])
  })

  it("ワイルドカードは . で始まる区切りに当たらず、<dir>/.* で書いたときだけ当たる", () => {
    const sample = sampleMap()
    const dotted = {
      ...sample,
      boxes: sample.boxes.map((box) =>
        box.id === "server" ? { ...box, paths: ["src/server/**", "src/hidden/.*"] } : box,
      ),
    }
    const parsed = parseArchitectureMap(JSON.stringify(dotted))
    if (parsed.kind !== "map") {
      throw new Error("地図が読めない")
    }
    const map = reportMapOf(
      parsed.map,
      [modified("src/server/.secret.ts"), modified("src/hidden/.rc")],
      KNOWN,
      matchesGlob,
    )

    expect(map.files.map((file) => file.path)).toEqual(["src/hidden/.rc"])
  })
})

describe("reportMapOf のずれ", () => {
  it("木が source.tree と一致したときは、赤の印と drift が残る", () => {
    const map = reportMapOf(loadedMap("tree-aaaa"), [], KNOWN, matchesGlob)

    expect(map.drift).toEqual([
      {
        from: "app/view",
        to: "server/store",
        sample: { from: "src/view/core/a.ts", to: "src/server/store/b.ts" },
      },
    ])
    expect(map.view.edges.some((edge) => edge.undeclared)).toBe(true)
  })

  it("木が一致しない・取れない・source.tree が無いときは、赤の印も drift も空になる", () => {
    const cases = [
      reportMapOf(loadedMap("tree-aaaa"), [], { kind: "known", sha: "tree-bbbb" }, matchesGlob),
      reportMapOf(loadedMap("tree-aaaa"), [], { kind: "unknown" }, matchesGlob),
      reportMapOf(loadedMap(), [], KNOWN, matchesGlob),
    ]

    for (const map of cases) {
      expect(map.drift).toEqual([])
      expect(map.view.edges.some((edge) => edge.undeclared)).toBe(false)
      expect(map.view.boxes.every((box) => box.problems.length === 0)).toBe(true)
    }
  })
})
