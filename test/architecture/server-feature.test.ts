import { readFileSync } from "node:fs"

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

describe("server/ の機能どうしの import", () => {
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
    expect(() => layerOf("server/unknown-feature/core/x.ts")).toThrow("の置き場を判定できない")
    expect(() => layerOf("server/report/x.ts")).toThrow(
      "機能 report の core/ か adapter/ の下に置く",
    )
    expect(() => layerOf("server/report/lib/x.ts")).toThrow(
      "機能 report の core/ か adapter/ の下に置く",
    )
    expect(() => layerOf("server/x.ts")).toThrow("src/server/x.ts の置き場を判定できない")
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

// 機能の下限を満たさないまま機能として残す例外（docs/architecture/server-feature.md「機能の下限」）。
const FEATURE_FLOOR_EXCEPTIONS = [
  "question",
  "system-prompt",
  "work-plan",
] as const satisfies readonly ServerFeature[]

describe("server/ の機能の下限", () => {
  it("機能は core/ と adapter/ の両方か shared/<機能>/ を持ち、例外の一覧は下限を満たさないものだけ", () => {
    const files = listSourceFiles(SRC_ROOT)
    const exceptions: readonly ServerFeature[] = FEATURE_FLOOR_EXCEPTIONS

    const offenders = SERVER_FEATURES.flatMap((feature) => {
      const meetsFloor = meetsFeatureFloor(feature, files)
      const excepted = exceptions.includes(feature)
      if (!meetsFloor && !excepted) {
        return [`${feature}: core/ と adapter/ の両方も shared/${feature}/ も無い`]
      }
      if (meetsFloor && excepted) {
        return [`${feature}: 下限を満たすので例外の一覧から外す`]
      }
      return []
    })

    expect(offenders.join("\n")).toBe("")
  })
})

function meetsFeatureFloor(feature: ServerFeature, files: readonly string[]): boolean {
  const layers = new Set(
    files.flatMap((relPath) => {
      if (!relPath.startsWith(`server/${feature}/`)) {
        return []
      }
      return [serverPlaceOf(relPath).layer]
    }),
  )
  const hasShared = files.some((relPath) => relPath.startsWith(`shared/${feature}/`))
  return (layers.has("core") && layers.has("adapter")) || hasShared
}

// `server/core/` `server/adapter/` の直下（`lib/` を含む）に置いてよいのは、どの機能にも
// 属さない共有の箱のファイルだけ（docs/architecture.md「サーバの機能と、機能どうしの辺」）。
// 共有の箱は「どの機能の語彙も名乗らず、読み手が2つ以上ある」ものだけを置く場所なので、
// 機能を読んではいけない（`.dependency-cruiser.cjs` が見る）し、読み手が
// 1つの機能だけに絞られたら、その機能の中へ下ろすのが正しい（`browser/domain/` の検査と同じ形）。
describe("server/ の共有の箱", () => {
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
