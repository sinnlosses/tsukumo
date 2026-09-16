import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

// 層をディレクトリで表す（docs/design.md 2章「層と依存の向き」）。ここは正規表現と node:fs だけで、
// 許した辺以外の import を落とす。外部ツールは増やさない。
//
// **3層（protocol / core / ui）＋サーバ側の境界（adapter）と配線（cli.ts）**。
// `adapter ──▶ core ──▶ protocol ◀── ui` で、**`core → adapter` は禁止**
// （docs/research/architecture-proposal.md 3章「許す依存の辺」。2026-09-16 の段2で切った）。

type Layer = "protocol" | "core" | "adapter" | "ui" | "cli"

// 各層が import してよい先（docs/coding-standards.md「層と依存の向き」の表そのもの）。
const ALLOWED_IMPORTS: Readonly<Record<Layer, ReadonlySet<Layer>>> = {
  protocol: new Set(["protocol"]),
  core: new Set(["protocol", "core"]),
  adapter: new Set(["protocol", "core", "adapter"]),
  ui: new Set(["protocol", "ui"]),
  cli: new Set(["protocol", "core", "adapter", "ui", "cli"]),
}

// `core` を「純粋な判断」に保つための禁止（3章「許す依存の辺」）。外の世界に触るものは
// すべて `adapter/` にあり、`core` はそれを import できないので、ここを塞ぐと
// **`core` から外の世界へ出る道が閉じる**。
const OUTSIDE_WORLD_IMPORT = /from\s+["'](node:|@anthropic-ai\/|ws")/

const SRC_ROOT = fileURLToPath(new URL("../src", import.meta.url)).replace(/\/$/, "")

type Violation = {
  readonly fromPath: string
  readonly fromLayer: Layer
  readonly toPath: string
  readonly toLayer: Layer
}

describe("層と依存の向き", () => {
  it("src/ の相対 import は、許した辺（protocol/core/adapter/ui + cli）だけで構成されている", () => {
    const files = listSourceFiles(SRC_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((relPath) => findViolations(relPath))

    expect(violationsMessage(violations)).toBe("")
  })

  it("protocol と core は node: / SDK / ws に触らない。protocol は document/window/localStorage にも", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => {
        const layer = layerOf(relPath)
        return layer === "protocol" || layer === "core"
      })
      .filter((relPath) => {
        const code = nonCommentContent(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
        return (
          OUTSIDE_WORLD_IMPORT.test(code) ||
          (layerOf(relPath) === "protocol" && /\b(document|window|localStorage)\b/.test(code))
        )
      })

    expect(offenders).toEqual([])
  })
})

// `orca` コマンドを起こすのはアダプタ1つに閉じ込める（docs/architecture.md 原則3、
// src/adapter/orca-host.ts 冒頭コメント）。`execFile("orca", …)` のような呼び出しは必ず
// コマンド名の文字列リテラル "orca" を伴うので、それを orca-host.ts の外から探す。
// ファイル名（`orca-host.ts`）やバッククォートで囲んだ日本語の説明文はクォートされた文字列
// リテラルではないので拾わない。
describe("orca コマンドを起こす箇所", () => {
  it("`orca` コマンドを呼ぶのは src/adapter/orca-host.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== "adapter/orca-host.ts")
      .filter((relPath) => /["']orca["']/.test(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")))

    expect(offenders).toEqual([])
  })
})

// ここから、層の辺だけでは表せない限定の検査（`adapter` の中のどのファイルか、まで絞る）。

// SDK（`@anthropic-ai/claude-agent-sdk`）を起こすのは駆動のファイル1つに閉じ込める
// （docs/architecture.md 原則3、src/adapter/sdk-driver.ts 冒頭コメント）。import 文の
// クォートされた specifier だけを拾うので、バッククォートで囲んだ日本語の説明文は拾わない
// （orca の検査と同じやり方）。
describe("Agent SDK を import する箇所", () => {
  it("`@anthropic-ai/claude-agent-sdk` を import するのは src/adapter/sdk-driver.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== "adapter/sdk-driver.ts")
      .filter((relPath) =>
        /from\s+["']@anthropic-ai\/claude-agent-sdk["']/.test(
          readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"),
        ),
      )

    expect(offenders).toEqual([])
  })
})

// `node:child_process` を起こすのはホスト（orca）とビルド（bun build）の2つの境界に閉じ込める
// （docs/architecture.md 原則3）。
describe("子プロセスを起こす箇所", () => {
  it("`node:child_process` を import するのは src/adapter/orca-host.ts と src/adapter/bundle.ts だけ", () => {
    const allowed = new Set(["adapter/orca-host.ts", "adapter/bundle.ts"])
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !allowed.has(relPath))
      .filter((relPath) =>
        /from\s+["']node:child_process["']/.test(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
      )

    expect(offenders).toEqual([])
  })
})

// 環境変数の読み取りは配線層の1ファイルに集める（docs/coding-standards.md「外の世界に依存する値
// は読み取りを1モジュールに集約する」）。コメント中の `` `process.env` `` のような説明文は
// 拾わない（実コードの行だけを見る）。
describe("process.env を読む箇所", () => {
  it("`process.env` を読むのは src/cli.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== "cli.ts")
      .filter((relPath) =>
        /\bprocess\.env\b/.test(nonCommentContent(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))),
      )

    expect(offenders).toEqual([])
  })
})

// 経路名のリテラルは protocol にだけ書く。両側（core と ui）が見る値は import で共有し、
// 文字列リテラルとして再掲しない（`src/protocol/session-socket.ts` が代表例）。
describe("経路名のリテラル", () => {
  it('"/ws" "/character/" "/vendor/" を文字列リテラルで書くのは protocol/ だけ', () => {
    const pathLiteralPatterns = [/["']\/ws["']/, /["']\/character\/["']/, /["']\/vendor\/["']/]
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !relPath.startsWith("protocol/"))
      .filter((relPath) => {
        const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
        return pathLiteralPatterns.some((pattern) => pattern.test(content))
      })

    expect(offenders).toEqual([])
  })
})

// `ui/` の中の横断 import を禁じる（`docs/design.md` 12章 段3「ui/ の作法」2）。
// 領域は `layout` / `main-view` / `character-view` / `sidebar` / `dispatch`。
// `ui/component/` `ui/style/` `ui/appearance/` と `ui/app.tsx` `ui/socket.ts` `ui/main.tsx`
// （領域のディレクトリの直下に無いもの。`UI_REGIONS` に無ければ自動的にここに入る）は誰から
// 引いてもよい共有部分なので、ここでは見ない。
//
// **`ui/report/` も共有部分に含めた**（段6。当初は「領域」の1つとして名指しされていたが、
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

/**
 * 単行コメント（`// ...`）だけの行を落とした中身を返す。`process.env` や `document` の説明を
 * バッククォートで書いたコメント（例: `` // `process.env` を読むのはここ1箇所 ``）を実コードの
 * 出現と取り違えないための下ごしらえ（このリポジトリの `.ts`/`.tsx` にブロックコメントは
 * 出てこない前提。JSDoc の `* ` 始まりの行にこの語が出てこないことは書いた時点で確認した）。
 */
function nonCommentContent(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
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
  if (top === "protocol" || top === "core" || top === "adapter" || top === "ui") {
    return top
  }
  throw new Error(`src/${relPath} の層を判定できない（層のディレクトリの外にある）`)
}

function violationsMessage(violations: readonly Violation[]): string {
  return violations
    .map((v) => `src/${v.fromPath}（${v.fromLayer}） → src/${v.toPath}（${v.toLayer}）`)
    .join("\n")
}
