import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { findFeatureCycle, type ServerFeature } from "./feature-graph.ts"
import {
  listSourceFiles,
  relativeImportSpecifiers,
  resolveRelativeImport,
  SRC_ROOT,
} from "./source-file.ts"

// shared の機能の一覧（docs/architecture.md「shared の機能」）。`satisfies` で
// サーバの機能の一覧の部分集合であることを検査する
// （置く物の無い機能 `system-prompt` `host` は shared には無い）。
const SHARED_FEATURES = [
  "achievement",
  "character-pack",
  "chat",
  "context-usage",
  "diagnostic",
  "diary",
  "experience-metric",
  "item",
  "plan-usage",
  "recommendation",
  "report",
  "repository",
  "session",
  "session-driver",
  "token-usage",
  "usage-review",
  "view-server",
  "workflow-setting",
] as const satisfies readonly ServerFeature[]
type SharedFeature = (typeof SHARED_FEATURES)[number]

// shared/ の直下に置いてよいファイル（docs/architecture.md「shared の機能」の「shared の直下」）。
// どの機能にも属さないプロトコルの3つだけ。
const SHARED_ROOT_FILES: ReadonlySet<string> = new Set(["frame.ts", "command.ts", "rpc.ts"])

// `shared` の下に置いてよいディレクトリ（直下のファイルのほかに）。`contract/` は機能ごとの契約の
// 置き場、`lib/` と `utils/` は docs/architecture.md「`lib/` と `utils/` に置く基準」、残りは
// shared の機能の一覧（`SHARED_FEATURES`。サーバの機能の一覧の部分集合であることは `satisfies` で
// 検査してある）。
const SHARED_DIRECTORIES: ReadonlySet<string> = new Set([
  "contract",
  "lib",
  "utils",
  ...SHARED_FEATURES,
])

describe("shared/ の機能どうしの import", () => {
  it("shared/ の直下のファイルは frame.ts・command.ts・rpc.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT).filter(
      (relPath) =>
        relPath.startsWith("shared/") &&
        relPath.split("/").length === 2 &&
        !SHARED_ROOT_FILES.has(relPath.split("/")[1] ?? ""),
    )

    expect(offenders).toEqual([])
  })

  it("shared の下のディレクトリは contract/・lib/・utils/ と shared の機能の一覧だけ", () => {
    const directories = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath.startsWith("shared/") && relPath.split("/").length > 2)
      .map((relPath) => relPath.split("/")[1] ?? "")

    expect([...new Set(directories)].filter((name) => !SHARED_DIRECTORIES.has(name))).toEqual([])
  })

  it("shared/<機能>/ の下にサブディレクトリが無い", () => {
    const offenders = listSourceFiles(SRC_ROOT).filter((relPath) => {
      const [top, second, ...rest] = relPath.split("/")
      return (
        top === "shared" && sharedFeatureOf(`${top}/${second}`) !== undefined && rest.length > 1
      )
    })

    expect(offenders).toEqual([])
  })

  it("shared の機能のディレクトリどうしの辺は循環しない", () => {
    const cycle = findFeatureCycle(sharedFeatureGraph(), SHARED_FEATURES)

    expect(cycle.join(" → ")).toBe("")
  })

  it("shared のファイルは server/ と browser/ の両方から（直接か shared の別ファイル経由で）読まれる", () => {
    const reachableFromServer = sharedFilesReachableFrom("server/")
    const reachableFromBrowser = sharedFilesReachableFrom("browser/")

    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath.startsWith("shared/"))
      .flatMap((relPath) => {
        const readers = [
          ...(reachableFromServer.has(relPath) ? [] : ["server/"]),
          ...(reachableFromBrowser.has(relPath) ? [] : ["browser/"]),
        ]
        return readers.length === 0 ? [] : [`src/${relPath} → ${readers.join("・")} から読まれない`]
      })

    expect(offenders.join("\n")).toBe("")
  })
})

/** `fromPrefix` で始まるファイルが直接読む `shared/` のファイルと、そこから `shared/` の中の import を辿って届くファイルの集まり。 */
function sharedFilesReachableFrom(fromPrefix: string): ReadonlySet<string> {
  const reached = new Set<string>()
  const queue = listSourceFiles(SRC_ROOT).filter((relPath) => relPath.startsWith(fromPrefix))
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const specifier of relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${next}`, "utf8"))) {
      const toPath = resolveRelativeImport(next, specifier)
      if (toPath.startsWith("shared/") && !reached.has(toPath)) {
        reached.add(toPath)
        queue.push(toPath)
      }
    }
  }
  return reached
}

/** `shared/<機能>/` のファイルなら、その機能の名前。直下のファイル・`contract/`・`utils/`・`lib/` は undefined。 */
function sharedFeatureOf(relPath: string): SharedFeature | undefined {
  const [top, second] = relPath.split("/")
  if (top !== "shared") {
    return undefined
  }
  return SHARED_FEATURES.find((name) => name === second)
}

/** `shared/` の機能のファイルから、別の機能のファイルへの相対 import をすべて返す（サーバの `serverFeatureEdges` と同じ形）。 */
function sharedFeatureEdges(): readonly {
  readonly fromFeature: SharedFeature
  readonly toFeature: SharedFeature
}[] {
  return listSourceFiles(SRC_ROOT)
    .filter((relPath) => relPath.startsWith("shared/"))
    .flatMap((fromPath) => {
      const fromFeature = sharedFeatureOf(fromPath)
      if (fromFeature === undefined) {
        return []
      }
      return relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${fromPath}`, "utf8")).flatMap(
        (specifier) => {
          const toPath = resolveRelativeImport(fromPath, specifier)
          const toFeature = sharedFeatureOf(toPath)
          return toFeature !== undefined && toFeature !== fromFeature
            ? [{ fromFeature, toFeature }]
            : []
        },
      )
    })
}

/** shared の機能どうしの辺をグラフにする（shared は層が1つなので、サーバの `featureGraphOf` と違い層は問わない）。 */
function sharedFeatureGraph(): ReadonlyMap<SharedFeature, ReadonlySet<SharedFeature>> {
  const edges = sharedFeatureEdges()
  return new Map(
    SHARED_FEATURES.map((feature) => [
      feature,
      new Set(edges.filter((edge) => edge.fromFeature === feature).map((edge) => edge.toFeature)),
    ]),
  )
}
