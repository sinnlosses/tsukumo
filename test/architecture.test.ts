import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

// 層をディレクトリで表す（docs/architecture.md「層をディレクトリで表し、依存の向きを
// テストで縛る」）。ここは正規表現と node:fs だけで、許した辺以外の import を落とす。
// 外部ツールは増やさない。

type Layer = "domain" | "usecase" | "presentation" | "infrastructure" | "index"

// 各層が import してよい先（docs/coding-standards.md「層と依存の向き」の表そのもの）。
// `src/presentation/browser/` の中身も presentation として扱う。
const ALLOWED_IMPORTS: Readonly<Record<Layer, ReadonlySet<Layer>>> = {
  domain: new Set(["domain"]),
  usecase: new Set(["domain", "usecase"]),
  presentation: new Set(["domain", "usecase", "presentation"]),
  infrastructure: new Set(["domain", "usecase", "presentation", "infrastructure"]),
  index: new Set(["domain", "usecase", "presentation", "infrastructure", "index"]),
}

const SRC_ROOT = fileURLToPath(new URL("../src", import.meta.url)).replace(/\/$/, "")

type Violation = {
  readonly fromPath: string
  readonly fromLayer: Layer
  readonly toPath: string
  readonly toLayer: Layer
}

describe("層と依存の向き", () => {
  it("src/ の相対 import は、許した辺（domain/usecase/presentation/infrastructure/index）だけで構成されている", () => {
    const files = listTsFiles(SRC_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((relPath) => findViolations(relPath))

    expect(violationsMessage(violations)).toBe("")
  })
})

/** `src/` 配下の `.ts` を再帰的に集める。相対パス（`domain/character.ts` のような形）で返す。 */
function listTsFiles(root: string, dir = root): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = `${dir}/${name}`
    if (statSync(fullPath).isDirectory()) {
      return listTsFiles(root, fullPath)
    }
    return name.endsWith(".ts") ? [fullPath.slice(root.length + 1)] : []
  })
}

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

/** `from "./x.ts"` / `from "../y.ts"` の形（import・re-export の両方）をすべて拾う。 */
function relativeImportSpecifiers(content: string): readonly string[] {
  const matches = content.matchAll(/from\s+["'](\.[^"']+)["']/g)
  return [...matches].flatMap(([, specifier]) => specifier ?? [])
}

/** import 元の相対パスと specifier から、import 先の `src/` 相対パスを解く。 */
function resolveRelativeImport(fromRelPath: string, specifier: string): string {
  const fromDirSegments = fromRelPath.split("/").slice(0, -1)
  const segments = [...fromDirSegments, ...specifier.split("/")]

  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === "." || segment === "") {
      continue
    }
    if (segment === "..") {
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }
  return resolved.join("/")
}

/** `src/` 相対パスから層を決める。`index.ts` は配線層で、それ以外は先頭ディレクトリで決まる。 */
function layerOf(relPath: string): Layer {
  if (relPath === "index.ts") {
    return "index"
  }
  const [top] = relPath.split("/")
  if (top === "domain" || top === "usecase" || top === "presentation" || top === "infrastructure") {
    return top
  }
  throw new Error(`src/${relPath} の層を判定できない（4層のディレクトリの外にある）`)
}

function violationsMessage(violations: readonly Violation[]): string {
  return violations
    .map((v) => `src/${v.fromPath}（${v.fromLayer}） → src/${v.toPath}（${v.toLayer}）`)
    .join("\n")
}
