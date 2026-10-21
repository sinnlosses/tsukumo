import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  featureGraphOf,
  findFeatureCycle,
  layerOf,
  SERVER_FEATURES,
  serverPlaceOf,
  type ServerFeature,
  type ServerFeatureEdge,
} from "./feature-graph.ts"
import {
  featureReadersOf,
  listSourceFiles,
  relativeImportSpecifiers,
  resolveRelativeImport,
  SRC_ROOT,
} from "./source-file.ts"

const DOC_ROOT = fileURLToPath(new URL("../../docs", import.meta.url)).replace(/\/$/, "")

// 機能 A が import してよい機能 B（同じ節の2つめの表と一致を検査する。表に無い組と、使われない組は落とす）。
// 共有の箱はどの機能からも読んでよいので、ここには出てこない。
const SERVER_FEATURE_IMPORTS: Readonly<Record<ServerFeature, ReadonlySet<ServerFeature>>> = {
  report: new Set([]),
  "system-prompt": new Set(["report", "chat", "session-driver"]),
  "context-usage": new Set(["session-driver"]),
  "experience-metric": new Set([]),
  diagnostic: new Set([]),
  "plan-usage": new Set([]),
  "token-usage": new Set(["repository"]),
  "usage-review": new Set(["session-driver"]),
  host: new Set([]),
  repository: new Set([]),
  recommendation: new Set([]),
  checkout: new Set([]),
  "workflow-setting": new Set([]),
  achievement: new Set(["repository"]),
  "character-pack": new Set([]),
  item: new Set([]),
  diary: new Set(["repository", "session-driver"]),
  chat: new Set(["character-pack", "session-driver"]),
  "session-driver": new Set(["chat", "report", "view-server"]),
  session: new Set([
    "session-driver",
    "chat",
    "diary",
    "token-usage",
    "context-usage",
    "experience-metric",
    "diagnostic",
    "character-pack",
    "report",
  ]),
  "view-server": new Set(["session"]),
}

describe("server/ の機能どうしの import", () => {
  it("機能どうしの import は SERVER_FEATURE_IMPORTS にある組だけ", () => {
    const offenders = serverFeatureEdges()
      .filter((edge) => !SERVER_FEATURE_IMPORTS[edge.fromFeature].has(edge.toFeature))
      .map(
        (edge) =>
          `src/${edge.fromPath}（${edge.fromFeature}） → src/${edge.toPath}（${edge.toFeature}）`,
      )

    expect(offenders.join("\n")).toBe("")
  })

  it("SERVER_FEATURE_IMPORTS の組は、どれも実際の import に1本以上ある", () => {
    const used = new Set(
      serverFeatureEdges().map((edge) => `${edge.fromFeature} → ${edge.toFeature}`),
    )
    const unused = SERVER_FEATURES.flatMap((from) =>
      [...SERVER_FEATURE_IMPORTS[from]].map((to) => `${from} → ${to}`),
    ).filter((pair) => !used.has(pair))

    expect(unused.join("\n")).toBe("")
  })

  it("docs/architecture/server-feature.md の機能どうしの辺の表は、SERVER_FEATURE_IMPORTS と同じ", () => {
    const table = featureEdgeTable()
    const mismatches = SERVER_FEATURES.flatMap((feature) => {
      const documented = table.get(feature)
      const actual = [...SERVER_FEATURE_IMPORTS[feature]].toSorted()
      if (documented === undefined) {
        return [`${feature}: 表に行も葉の列挙も無い`]
      }
      return documented.toSorted().join(" ") === actual.join(" ")
        ? []
        : [
            `${feature}: 表 [${documented.join(" ")}] / SERVER_FEATURE_IMPORTS [${actual.join(" ")}]`,
          ]
    })
    const known = new Set<string>(SERVER_FEATURES)
    const unknown = [...table.keys()].filter((feature) => !known.has(feature))

    expect(
      [...mismatches, ...unknown.map((feature) => `${feature}: 知らない機能が表にある`)].join("\n"),
    ).toBe("")
  })

  it("機能の core/ どうし・adapter/ どうしの辺は、それぞれ循環しない", () => {
    const cycles = (["core", "adapter"] as const).flatMap((layer) => {
      const cycle = findFeatureCycle(featureGraphOf(serverFeatureEdges(), layer), SERVER_FEATURES)
      return cycle.length === 0 ? [] : [`${layer}: ${cycle.join(" → ")}`]
    })

    expect(cycles.join("\n")).toBe("")
  })

  // 上の2つが黙って空振りしないことの確かめ（検査の道具そのものの振る舞い）。
  it("層の判定は、知らない機能・機能の中で core/ adapter/ の外・server/ の直下で throw する", () => {
    expect(layerOf("server/report/core/report-tool.ts")).toBe("core")
    expect(layerOf("server/core/config.ts")).toBe("core")
    expect(layerOf("server/adapter/lib/json-file.ts")).toBe("adapter")
    expect(() => layerOf("server/unknown-feature/core/x.ts")).toThrow()
    expect(() => layerOf("server/report/x.ts")).toThrow()
    expect(() => layerOf("server/report/lib/x.ts")).toThrow()
    expect(() => layerOf("server/x.ts")).toThrow()
  })

  it("循環の検出は、機能どうしの輪を見つける", () => {
    const graph = new Map<ServerFeature, ReadonlySet<ServerFeature>>([
      ["report", new Set(["system-prompt"])],
      ["system-prompt", new Set(["report"])],
    ])

    expect(findFeatureCycle(graph, SERVER_FEATURES)).toEqual(["report", "system-prompt", "report"])
    expect(
      findFeatureCycle(
        new Map<ServerFeature, ReadonlySet<ServerFeature>>([
          ["system-prompt", new Set(["report"])],
        ]),
        SERVER_FEATURES,
      ),
    ).toEqual([])
  })
})

// `server/core/` `server/adapter/` の直下（`lib/` を含む）に置いてよいのは、どの機能にも
// 属さない共有の箱のファイルだけ（docs/architecture.md「サーバの機能と、機能どうしの辺」）。
// 共有の箱は「どの機能の語彙も名乗らず、読み手が2つ以上ある」ものだけを置く場所なので、
// 機能を読んではいけない（読むなら、その機能の中か機能どうしの辺の表で表す）し、読み手が
// 1つの機能だけに絞られたら、その機能の中へ下ろすのが正しい（`browser/domain/` の検査と同じ形）。
describe("server/ の共有の箱", () => {
  it("共有の箱（server/core/・server/adapter/ の直下）は機能のディレクトリを import しない", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter(
        (relPath) => relPath.startsWith("server/") && serverPlaceOf(relPath).kind === "shared",
      )
      .flatMap((relPath) =>
        relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).flatMap(
          (specifier) => {
            const toPath = resolveRelativeImport(relPath, specifier)
            if (!toPath.startsWith("server/")) {
              return []
            }
            return serverPlaceOf(toPath).kind === "feature"
              ? [`src/${relPath} → src/${toPath}`]
              : []
          },
        ),
      )

    expect(offenders.join("\n")).toBe("")
  })

  it("共有の箱に、1つの機能だけが読むファイルは無い", () => {
    const files = listSourceFiles(SRC_ROOT).filter(
      (relPath) => relPath.startsWith("server/") && serverPlaceOf(relPath).kind === "shared",
    )
    expect(files.length).toBeGreaterThan(0)

    const offenders = files.flatMap((relPath) => {
      const readers = featureReadersOf(relPath, "", serverFeatureOf)
      return readers.features.length === 1 && readers.outsideFeatureCount === 0
        ? [`src/${relPath}（読むのは ${readers.features.join("")} だけ）`]
        : []
    })

    expect(offenders.join("\n")).toBe("")
  })
})

function serverFeatureOf(relPath: string): ServerFeature | undefined {
  if (!relPath.startsWith("server/")) {
    return undefined
  }
  const place = serverPlaceOf(relPath)
  return place.kind === "feature" ? place.feature : undefined
}

/** docs/architecture/server-feature.md の機能どうしの辺の表から、機能 → 読んでよい機能を取り出す（`そのほか` 行の葉は空）。 */
function featureEdgeTable(): ReadonlyMap<string, readonly string[]> {
  const doc = readFileSync(`${DOC_ROOT}/architecture/server-feature.md`, "utf8")
  const start = doc.indexOf("\n| 機能（import する側） |")
  const end = doc.indexOf("\n\n", start + 1)
  const quoted = (cell: string): readonly string[] =>
    [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "")
  const rows = doc
    .slice(start, end)
    .split("\n")
    .filter((line) => line.startsWith("| `") || line.startsWith("| そのほか"))
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => cells[2] !== undefined && cells[1] !== "機能")
  return new Map(
    rows.flatMap((cells): readonly (readonly [string, readonly string[]])[] => {
      const [, first = "", second = ""] = cells
      if (first === "そのほか") {
        return quoted(second).map((leaf) => [leaf, []] as const)
      }
      return [[quoted(first)[0] ?? "", quoted(second)]]
    }),
  )
}

/** `server/` の機能のファイルから、別の機能のファイルへの相対 import をすべて返す。 */
function serverFeatureEdges(): readonly ServerFeatureEdge[] {
  return listSourceFiles(SRC_ROOT)
    .filter((relPath) => relPath.startsWith("server/"))
    .flatMap((fromPath) => {
      const from = serverPlaceOf(fromPath)
      if (from.kind !== "feature") {
        return []
      }
      return relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${fromPath}`, "utf8")).flatMap(
        (specifier) => {
          const toPath = resolveRelativeImport(fromPath, specifier)
          if (!toPath.startsWith("server/")) {
            return []
          }
          const to = serverPlaceOf(toPath)
          return to.kind === "feature" && to.feature !== from.feature
            ? [
                {
                  fromPath,
                  fromFeature: from.feature,
                  fromLayer: from.layer,
                  toPath,
                  toFeature: to.feature,
                  toLayer: to.layer,
                },
              ]
            : []
        },
      )
    })
}
