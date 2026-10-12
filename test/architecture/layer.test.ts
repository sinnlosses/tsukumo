import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  importSpecifiers,
  listSourceFiles,
  nonCommentContent,
  relativeImportSpecifiers,
  resolveRelativeImport,
  SRC_ROOT,
} from "./source-file.ts"

// 層をディレクトリで表す（docs/architecture.md「層と依存の向き」）。ここは正規表現と node:fs だけで、
// 許した辺以外の import を落とす。外部ツールは増やさない。
//
// 3層（shared / server / browser）で、サーバ側は機能ごとに判断（`server/<機能>/core/`）と
// 境界（`server/<機能>/adapter/`）の2段、どの機能にも属さない共有の箱は `server/core/`
// `server/adapter/` の直下（docs/architecture.md「サーバの機能と、機能どうしの辺」）。配線は
// `src/` 直下のファイル（`cli.ts` / `main.ts` と、そこから呼ばれる起動の段取り）と、機能ごとの
// 組み立ての `src/wiring/`。
// `adapter ──▶ core ──▶ shared ◀── browser` で、`core → adapter` は禁止（機能をまたいでも
// 同じに効く）。機能どうしの辺は `SERVER_FEATURE_IMPORTS` にある組だけで、層ごとに循環させない。

type Layer = "shared" | "core" | "adapter" | "browser" | "cli" | "ambient"

// 各層が import してよい先（docs/coding-standards.md「層と依存の向き」の表そのもの）。
const ALLOWED_IMPORTS: Readonly<Record<Layer, ReadonlySet<Layer>>> = {
  shared: new Set(["shared"]),
  core: new Set(["shared", "core"]),
  adapter: new Set(["shared", "core", "adapter"]),
  browser: new Set(["shared", "browser"]),
  cli: new Set(["shared", "core", "adapter", "browser", "cli"]),
  ambient: new Set(),
}

// `core` を「純粋な判断」に保つための禁止（3章「許す依存の辺」）。外の世界に触るものは
// すべて `adapter/` にあり、`core` はそれを import できないので、ここを塞ぐと
// `core` から外の世界へ出る道が閉じる。
const OUTSIDE_WORLD_IMPORT = /from\s+["'](node:|@anthropic-ai\/|ws")/

const DOC_ROOT = fileURLToPath(new URL("../../docs", import.meta.url)).replace(/\/$/, "")

type Violation = {
  readonly fromPath: string
  readonly fromLayer: Layer
  readonly toPath: string
  readonly toLayer: Layer
}

describe("層と依存の向き", () => {
  it("src/ の相対 import は、許した辺（shared/core/adapter/browser + cli）だけで構成されている", () => {
    const files = listSourceFiles(SRC_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((relPath) => findViolations(relPath))

    expect(violationsMessage(violations)).toBe("")
  })

  it("shared と core は node: / SDK / ws に触らない。shared は document/window/localStorage にも", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => {
        const layer = layerOf(relPath)
        return layer === "shared" || layer === "core"
      })
      .filter((relPath) => {
        const code = nonCommentContent(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
        return (
          OUTSIDE_WORLD_IMPORT.test(code) ||
          (layerOf(relPath) === "shared" && /\b(document|window|localStorage)\b/.test(code))
        )
      })

    expect(offenders).toEqual([])
  })
})

// サーバの機能（docs/architecture.md「サーバの機能と、機能どうしの辺」の1つめの表）。機能を足す
// ときは、ここと `SERVER_FEATURE_IMPORTS` に足す（一覧に無いディレクトリを `server/` の下に
// 作ると `layerOf` が throw する）。まだ移していないファイルは共有の箱（`server/core/`
// `server/adapter/` の直下）に居るまま動く。
const SERVER_FEATURES = [
  "report",
  "system-prompt",
  "context-usage",
  "experience-metric",
  "diagnostic",
  "plan-usage",
  "token-usage",
  "usage-review",
  "host",
  "repository",
  "recommendation",
  "checkout",
  "achievement",
  "character-pack",
  "diary",
  "chat",
  "session-driver",
  "session",
  "view-server",
] as const
type ServerFeature = (typeof SERVER_FEATURES)[number]

// 機能 A が import してよい機能 B（同じ節の2つめの表と一致を検査する。表に無い組と、使われない組は落とす）。
// 共有の箱はどの機能からも読んでよいので、ここには出てこない。
const SERVER_FEATURE_IMPORTS: Readonly<Record<ServerFeature, ReadonlySet<ServerFeature>>> = {
  report: new Set([]),
  "system-prompt": new Set(["report", "chat", "session-driver"]),
  "context-usage": new Set(["session-driver"]),
  "experience-metric": new Set([]),
  diagnostic: new Set([]),
  "plan-usage": new Set([]),
  "token-usage": new Set([]),
  "usage-review": new Set(["session-driver"]),
  host: new Set([]),
  repository: new Set([]),
  recommendation: new Set([]),
  checkout: new Set([]),
  achievement: new Set(["repository"]),
  "character-pack": new Set([]),
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

// shared の機能の一覧（docs/architecture.md「shared の機能」）。`satisfies` で
// `SERVER_FEATURE_IMPORTS` の鍵（サーバの機能の一覧）の部分集合であることを検査する
// （置く物の無い機能 `system-prompt` `host` は shared には無い）。
const SHARED_FEATURES = [
  "achievement",
  "character-pack",
  "chat",
  "context-usage",
  "diagnostic",
  "diary",
  "experience-metric",
  "plan-usage",
  "recommendation",
  "report",
  "repository",
  "session",
  "session-driver",
  "token-usage",
  "usage-review",
  "view-server",
] as const satisfies readonly ServerFeature[]
type SharedFeature = (typeof SHARED_FEATURES)[number]

type ServerLayer = "core" | "adapter"

/** `server/` の下のファイルの置き場。共有の箱か、機能の層か。 */
type ServerPlace =
  | { readonly kind: "shared"; readonly layer: ServerLayer }
  | { readonly kind: "feature"; readonly feature: ServerFeature; readonly layer: ServerLayer }

/** 機能 A から別の機能 B への import 1本（同じ機能の中の辺は含めない）。 */
type ServerFeatureEdge = {
  readonly fromPath: string
  readonly fromFeature: ServerFeature
  readonly fromLayer: ServerLayer
  readonly toPath: string
  readonly toFeature: ServerFeature
  readonly toLayer: ServerLayer
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

  it("docs/architecture.md の機能どうしの辺の表は、SERVER_FEATURE_IMPORTS と同じ", () => {
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
      const readers = serverSharedBoxReadersOf(relPath)
      return readers.features.length === 1 && readers.outsideFeatureCount === 0
        ? [`src/${relPath}（読むのは ${readers.features.join("")} だけ）`]
        : []
    })

    expect(offenders.join("\n")).toBe("")
  })
})

// 手続き（oRPC）の依存の辺（docs/architecture.md「コマンドの受け手と手続きの置き方」の「許す依存の
// 辺」）。受け手を付ける `@orpc/server` は外の世界に触る側（機能の `adapter/` と配線）だけが読み、
// `core` と共有の箱からは読まない。契約だけを書く `@orpc/contract` は `shared` が読んでよい
// （ブラウザも読むので、`@orpc/server` と `node:` は読まない）。
const ORPC_SERVER_FILE = /^(?:server\/[^/]+\/adapter\/.+|[^/]+)\.ts$/

// `shared` が読んでよい外部パッケージ（相対でない specifier）。`remeda` は手続きより前から読んでいる。
const SHARED_EXTERNAL_PACKAGES: ReadonlySet<string> = new Set(["zod", "@orpc/contract", "remeda"])

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

// shared/ の直下に置いてよいファイル（docs/architecture.md「shared の機能」の「shared の直下」）。
// どの機能にも属さないプロトコルの3つだけ。
const SHARED_ROOT_FILES: ReadonlySet<string> = new Set(["frame.ts", "command.ts", "rpc.ts"])

describe("手続き（oRPC）を import する箇所", () => {
  it("`@orpc/server` を import するのは機能の adapter/ と配線（src/ 直下）だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !ORPC_SERVER_FILE.test(relPath))
      .filter((relPath) =>
        importSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).some(
          (specifier) => specifier === "@orpc/server" || specifier.startsWith("@orpc/server/"),
        ),
      )

    expect(offenders).toEqual([])
  })

  it("shared が読む外部パッケージは zod・@orpc/contract・remeda だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => layerOf(relPath) === "shared")
      .flatMap((relPath) =>
        importSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
          .filter((specifier) => !specifier.startsWith("."))
          .filter((specifier) => !SHARED_EXTERNAL_PACKAGES.has(specifier))
          .map((specifier) => `src/${relPath} → ${specifier}`),
      )

    expect(offenders).toEqual([])
  })

  it("shared の下のディレクトリは contract/・lib/・utils/ と shared の機能の一覧だけ", () => {
    const directories = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath.startsWith("shared/") && relPath.split("/").length > 2)
      .map((relPath) => relPath.split("/")[1] ?? "")

    expect([...new Set(directories)].filter((name) => !SHARED_DIRECTORIES.has(name))).toEqual([])
  })
})

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

  it("shared の機能のディレクトリは shared/contract/ と shared/rpc.ts を import しない", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => sharedFeatureOf(relPath) !== undefined)
      .flatMap((relPath) =>
        relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).flatMap(
          (specifier) => {
            const toPath = resolveRelativeImport(relPath, specifier)
            return toPath.startsWith("shared/contract/") || toPath === "shared/rpc.ts"
              ? [`src/${relPath} → src/${toPath}`]
              : []
          },
        ),
      )

    expect(offenders.join("\n")).toBe("")
  })

  it("shared/utils/ のファイルは shared/utils/ の中と汎用のライブラリしか import しない", () => {
    // `zod`・`@orpc/contract` は shared 全体で読んでよいが固有の用途のライブラリなので、
    // ここでの「汎用のライブラリ」は `remeda` だけ（browser/utils/ の "react" は browser 専用）。
    const sharedUtilsAllowedExternalPackages: ReadonlySet<string> = new Set(["remeda"])
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath.startsWith("shared/utils/"))
      .flatMap((relPath) =>
        importSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
          .filter(
            (specifier) =>
              !isInsideSharedUtils(relPath, specifier) &&
              !sharedUtilsAllowedExternalPackages.has(specifier),
          )
          .map((specifier) => `src/${relPath} → ${specifier}`),
      )

    expect(offenders.join("\n")).toBe("")
  })
})

// 経路名のリテラルは shared にだけ書く。両側（core と browser）が見る値は import で共有し、
// 文字列リテラルとして再掲しない（`src/shared/view-server/session-socket.ts` が代表例）。
describe("経路名のリテラル", () => {
  it('"/ws" "/character/" "/vendor/" を文字列リテラルで書くのは shared/ だけ', () => {
    const pathLiteralPatterns = [/["']\/ws["']/, /["']\/character\/["']/, /["']\/vendor\/["']/]
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !relPath.startsWith("shared/"))
      .filter((relPath) => {
        const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
        return pathLiteralPatterns.some((pattern) => pattern.test(content))
      })

    expect(offenders).toEqual([])
  })
})

/** ファイル1件の相対 import をすべて調べ、許した辺に無いものを違反として返す。 */
function findViolations(relPath: string): readonly Violation[] {
  const fromLayer = layerOf(relPath)
  const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
  const allowed = ALLOWED_IMPORTS[fromLayer]

  return relativeImportSpecifiers(content).flatMap((specifier) => {
    const toPath = resolveRelativeImport(relPath, specifier)
    const toLayer = layerOf(toPath)
    return allowed.has(toLayer) ? [] : [{ fromPath: relPath, fromLayer, toPath, toLayer }]
  })
}

/** specifier が相対で、解いた先が `shared/utils/` の中か。 */
function isInsideSharedUtils(fromRelPath: string, specifier: string): boolean {
  return (
    specifier.startsWith(".") &&
    resolveRelativeImport(fromRelPath, specifier).startsWith("shared/utils/")
  )
}

/**
 * `src/` 相対パスから層を決める。`src/` 直下のファイルは配線層（`cli.ts` と `main.ts`、
 * そこから呼ばれる起動の段取り。`core` と `adapter` を結べるのはここだけ）、`shared/` と
 * `browser/` は先頭ディレクトリ、サーバ側は置き場（`serverPlaceOf`）の層で決まる。
 * `types/` の `*.d.ts` はどの層にも属さない ambient 宣言で、何も import しない。
 */
function layerOf(relPath: string): Layer {
  if (!relPath.includes("/")) {
    return "cli"
  }
  const [top] = relPath.split("/")
  if (top === "wiring") {
    return "cli"
  }
  if (top === "types" && relPath.endsWith(".d.ts")) {
    return "ambient"
  }
  if (top === "shared" || top === "browser") {
    return top
  }
  if (top === "server") {
    return serverPlaceOf(relPath).layer
  }
  throw new Error(`src/${relPath} の層を判定できない（層のディレクトリの外にある）`)
}

/**
 * `server/` の下のファイルの置き場を決める。`server/core/` `server/adapter/` の下（`lib/` を含む）は
 * 共有の箱、`server/<機能>/core/` `server/<機能>/adapter/` の下は機能の層。`SERVER_FEATURES` に
 * 無いディレクトリ、機能の中で `core/` `adapter/` の外に置いたファイル、`server/` の直下の
 * ファイルは `throw`（判断か境界かを名乗っていないものと、足し忘れた機能を素通りさせない）。
 */
function serverPlaceOf(relPath: string): ServerPlace {
  const [, second, third, ...rest] = relPath.split("/")
  if ((second === "core" || second === "adapter") && third !== undefined) {
    return { kind: "shared", layer: second }
  }
  const feature = SERVER_FEATURES.find((name) => name === second)
  if (feature === undefined) {
    throw new Error(
      `src/${relPath} の置き場を判定できない（新しい機能なら SERVER_FEATURES と SERVER_FEATURE_IMPORTS に足す）`,
    )
  }
  if ((third === "core" || third === "adapter") && rest.length > 0) {
    return { kind: "feature", feature, layer: third }
  }
  throw new Error(`src/${relPath} は機能 ${feature} の core/ か adapter/ の下に置く`)
}

/**
 * `server/` の共有の箱のファイル1件を import している機能の名前（重複を畳んだもの）と、機能の外
 * （配線層・別の共有の箱のファイルなど）からの読み手の数。`browserReadersOf` と同じ作り
 * （検索する範囲は `src/` 全体——配線層（`src/` 直下）も共有の箱を読むため）。
 */
function serverSharedBoxReadersOf(targetRelPath: string): {
  readonly features: readonly string[]
  readonly outsideFeatureCount: number
} {
  const readers = listSourceFiles(SRC_ROOT)
    .filter((relPath) => relPath !== targetRelPath)
    .filter((relPath) =>
      relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).some(
        (specifier) => resolveRelativeImport(relPath, specifier) === targetRelPath,
      ),
    )
  const featureOf = (relPath: string): ServerFeature | undefined => {
    if (!relPath.startsWith("server/")) {
      return undefined
    }
    const place = serverPlaceOf(relPath)
    return place.kind === "feature" ? place.feature : undefined
  }

  return {
    features: [...new Set(readers.flatMap((relPath) => featureOf(relPath) ?? []))],
    outsideFeatureCount: readers.filter((relPath) => featureOf(relPath) === undefined).length,
  }
}

/** docs/architecture.md の機能どうしの辺の表から、機能 → 読んでよい機能を取り出す（`そのほか` 行の葉は空）。 */
function featureEdgeTable(): ReadonlyMap<string, readonly string[]> {
  const doc = readFileSync(`${DOC_ROOT}/architecture.md`, "utf8")
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

/** 機能どうしの辺のうち、両端が同じ層（`core/` どうし・`adapter/` どうし）のものを機能のグラフにする。 */
function featureGraphOf(
  edges: readonly ServerFeatureEdge[],
  layer: ServerLayer,
): ReadonlyMap<ServerFeature, ReadonlySet<ServerFeature>> {
  const sameLayer = edges.filter((edge) => edge.fromLayer === layer && edge.toLayer === layer)
  return new Map(
    SERVER_FEATURES.map((feature) => [
      feature,
      new Set(
        sameLayer.filter((edge) => edge.fromFeature === feature).map((edge) => edge.toFeature),
      ),
    ]),
  )
}

/**
 * 機能のグラフに輪があれば、最初に見つけた1つを始点に戻るまでの並びで返す。無ければ空。
 * `T` は機能の名前の型（サーバの `ServerFeature` と shared の `SharedFeature` の両方で使い回す）で、
 * `allNodes` は輪の探索を始める全ノード（グラフに登場しないノードも取りこぼさないため）。
 */
function findFeatureCycle<T extends string>(
  graph: ReadonlyMap<T, ReadonlySet<T>>,
  allNodes: readonly T[],
): readonly T[] {
  const walk = (node: T, path: readonly T[]): readonly T[] => {
    const seenAt = path.indexOf(node)
    if (seenAt >= 0) {
      return [...path.slice(seenAt), node]
    }
    return [...(graph.get(node) ?? [])].reduce<readonly T[]>(
      (found, next) => (found.length > 0 ? found : walk(next, [...path, node])),
      [],
    )
  }
  return allNodes.reduce<readonly T[]>(
    (found, start) => (found.length > 0 ? found : walk(start, [])),
    [],
  )
}

function violationsMessage(violations: readonly Violation[]): string {
  return violations
    .map((v) => `src/${v.fromPath}（${v.fromLayer}） → src/${v.toPath}（${v.toLayer}）`)
    .join("\n")
}
