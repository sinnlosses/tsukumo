import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

// 層をディレクトリで表す（docs/design.md 2章「層と依存の向き」）。ここは正規表現と node:fs だけで、
// 許した辺以外の import を落とす。外部ツールは増やさない。
//
// **3層（protocol / core / ui）と配線（cli.ts）の3辺だけ**（docs/design.md 12章 段7で
// 旧の domain / usecase / presentation / infrastructure がすべて消えた）。

type Layer = "protocol" | "core" | "ui" | "cli"

// 各層が import してよい先（docs/coding-standards.md「層と依存の向き」の表そのもの）。
const ALLOWED_IMPORTS: Readonly<Record<Layer, ReadonlySet<Layer>>> = {
  protocol: new Set(["protocol"]),
  core: new Set(["protocol", "core"]),
  ui: new Set(["protocol", "ui"]),
  cli: new Set(["protocol", "core", "ui", "cli"]),
}

const SRC_ROOT = fileURLToPath(new URL("../src", import.meta.url)).replace(/\/$/, "")

type Violation = {
  readonly fromPath: string
  readonly fromLayer: Layer
  readonly toPath: string
  readonly toLayer: Layer
}

describe("層と依存の向き", () => {
  it("src/ の相対 import は、許した辺（protocol/core/ui + cli）だけで構成されている", () => {
    const files = listSourceFiles(SRC_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((relPath) => findViolations(relPath))

    expect(violationsMessage(violations)).toBe("")
  })

  it("protocol は node: にも document にも触らない（両側で動く純粋な契約）", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => layerOf(relPath) === "protocol")
      .filter((relPath) => /from\s+["']node:/.test(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")))

    expect(offenders).toEqual([])
  })
})

// `ui/` の中の横断 import を禁じる（`docs/design.md` 12章 段3「ui/ の作法」2）。
// 領域は `layout` / `main-view` / `character-view` / `sidebar` / `dispatch`。
// `ui/component/` `ui/style/` と `ui/app.tsx` `ui/socket.ts` `ui/main.tsx`（領域のディレクトリの
// 直下に無いもの）は誰から引いてもよい共有部分なので、ここでは見ない。
//
// **`ui/report/` も共有部分に含めた**（段6。当初 T-096 で「領域」の1つとして名指しされていたが、
// `report/` は state を持たない Markdown の描画プリミティブ（unified の構成・sanitize の
// schema・MermaidBlock・ChartBlock）で、それ自体が何かの「機能」ではなく `ui/component/` と
// 同じ役割。`main-view/` の `<Report>` が `<Markdown>` を直接使う必要があり、横断 import 禁止の
// 対象にすると設計（`docs/design.md` 6.1 の部品の木）と両立しない）。
const UI_REGIONS = ["layout", "main-view", "character-view", "sidebar", "dispatch"] as const
type UiRegion = (typeof UI_REGIONS)[number]

type UiRegionViolation = {
  readonly fromPath: string
  readonly fromRegion: UiRegion
  readonly toPath: string
  readonly toRegion: UiRegion
}

describe("ui/ の領域どうしの import", () => {
  it("ui/<領域>/ から別の ui/<領域>/ への import が無い", () => {
    const files = listSourceFiles(SRC_ROOT).filter((relPath) => relPath.startsWith("ui/"))
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((relPath) => findUiRegionViolations(relPath))

    expect(uiRegionViolationsMessage(violations)).toBe("")
  })
})

/** ファイル1件の相対 import から、別の ui 領域を指すものだけを違反として返す。 */
function findUiRegionViolations(relPath: string): readonly UiRegionViolation[] {
  const fromRegion = uiRegionOf(relPath)
  if (fromRegion === undefined) {
    return []
  }

  const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
  return relativeImportSpecifiers(content).flatMap((specifier) => {
    const toPath = resolveRelativeImport(relPath, specifier)
    const toRegion = uiRegionOf(toPath)
    return toRegion === undefined || toRegion === fromRegion
      ? []
      : [{ fromPath: relPath, fromRegion, toPath, toRegion }]
  })
}

/** `ui/<領域>/...` の形なら領域名を返す。共有部分（`ui/component/` など）は undefined。 */
function uiRegionOf(relPath: string): UiRegion | undefined {
  const [top, second] = relPath.split("/")
  if (top !== "ui" || second === undefined) {
    return undefined
  }
  return isUiRegion(second) ? second : undefined
}

function isUiRegion(value: string): value is UiRegion {
  return UI_REGIONS.some((region) => region === value)
}

function uiRegionViolationsMessage(violations: readonly UiRegionViolation[]): string {
  return violations
    .map((v) => `src/${v.fromPath}（${v.fromRegion}） → src/${v.toPath}（${v.toRegion}）`)
    .join("\n")
}

/** `src/` 配下の `.ts` / `.tsx` を再帰的に集める。相対パス（`protocol/character.ts`）で返す。 */
function listSourceFiles(root: string, dir = root): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = `${dir}/${name}`
    if (statSync(fullPath).isDirectory()) {
      return listSourceFiles(root, fullPath)
    }
    return name.endsWith(".ts") || name.endsWith(".tsx") ? [fullPath.slice(root.length + 1)] : []
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

/** `src/` 相対パスから層を決める。`cli.ts` は配線層で、それ以外は先頭ディレクトリで決まる。 */
function layerOf(relPath: string): Layer {
  if (relPath === "cli.ts") {
    return "cli"
  }
  const [top] = relPath.split("/")
  if (top === "protocol" || top === "core" || top === "ui") {
    return top
  }
  throw new Error(`src/${relPath} の層を判定できない（層のディレクトリの外にある）`)
}

function violationsMessage(violations: readonly Violation[]): string {
  return violations
    .map((v) => `src/${v.fromPath}（${v.fromLayer}） → src/${v.toPath}（${v.toLayer}）`)
    .join("\n")
}
