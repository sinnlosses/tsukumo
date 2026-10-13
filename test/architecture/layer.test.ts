import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { withoutComments } from "../comment-line.ts"
import { layerOf, type Layer } from "./feature-graph.ts"
import {
  importSpecifiers,
  listSourceFiles,
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
// 同じに効く）。機能どうしの辺は `server-feature.test.ts` の `SERVER_FEATURE_IMPORTS` にある組だけで、
// 層ごとに循環させない。

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
        const code = withoutComments(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
        return (
          OUTSIDE_WORLD_IMPORT.test(code) ||
          (layerOf(relPath) === "shared" && /\b(document|window|localStorage)\b/.test(code))
        )
      })

    expect(offenders).toEqual([])
  })
})

// 手続き（oRPC）の依存の辺（docs/architecture.md「コマンドの受け手と手続きの置き方」の「許す依存の
// 辺」）。受け手を付ける `@orpc/server` は外の世界に触る側（機能の `adapter/` と配線）だけが読み、
// `core` と共有の箱からは読まない。契約だけを書く `@orpc/contract` は `shared` が読んでよい
// （ブラウザも読むので、`@orpc/server` と `node:` は読まない）。
const ORPC_SERVER_FILE = /^(?:server\/[^/]+\/adapter\/.+|[^/]+)\.ts$/

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

function violationsMessage(violations: readonly Violation[]): string {
  return violations
    .map((v) => `src/${v.fromPath}（${v.fromLayer}） → src/${v.toPath}（${v.toLayer}）`)
    .join("\n")
}
