// 層の判定と、機能どうしの辺のグラフ。

export type Layer = "shared" | "core" | "adapter" | "browser" | "cli" | "ambient"

// サーバの機能（docs/architecture/server-feature.md「サーバの機能と、機能どうしの辺」の1つめの表）。機能を足す
// ときは、ここと `SERVER_FEATURE_IMPORTS` に足す（一覧に無いディレクトリを `server/` の下に
// 作ると `layerOf` が throw する）。まだ移していないファイルは共有の箱（`server/core/`
// `server/adapter/` の直下）に居るまま動く。
export const SERVER_FEATURES = [
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
  "welcome-greeting",
  "checkout",
  "workflow-setting",
  "achievement",
  "character-pack",
  "item",
  "diary",
  "chat",
  "session-driver",
  "session",
  "view-server",
] as const
export type ServerFeature = (typeof SERVER_FEATURES)[number]

export type ServerLayer = "core" | "adapter"

/** `server/` の下のファイルの置き場。共有の箱か、機能の層か。 */
export type ServerPlace =
  | { readonly kind: "shared"; readonly layer: ServerLayer }
  | { readonly kind: "feature"; readonly feature: ServerFeature; readonly layer: ServerLayer }

/** 機能 A から別の機能 B への import 1本（同じ機能の中の辺は含めない）。 */
export type ServerFeatureEdge = {
  readonly fromPath: string
  readonly fromFeature: ServerFeature
  readonly fromLayer: ServerLayer
  readonly toPath: string
  readonly toFeature: ServerFeature
  readonly toLayer: ServerLayer
}

/**
 * `src/` 相対パスから層を決める。`src/` 直下のファイルは配線層（`cli.ts` と `main.ts`、
 * そこから呼ばれる起動の段取り。`core` と `adapter` を結べるのはここだけ）、`shared/` と
 * `browser/` は先頭ディレクトリ、サーバ側は置き場（`serverPlaceOf`）の層で決まる。
 * `types/` の `*.d.ts` はどの層にも属さない ambient 宣言で、何も import しない。
 */
export function layerOf(relPath: string): Layer {
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
export function serverPlaceOf(relPath: string): ServerPlace {
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

/** 機能どうしの辺のうち、両端が同じ層（`core/` どうし・`adapter/` どうし）のものを機能のグラフにする。 */
export function featureGraphOf(
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
export function findFeatureCycle<T extends string>(
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
