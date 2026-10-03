// 変えたファイルから、流す E2E のファイルを選ぶ。1件でも選べない変更があれば全件に倒す。
// 規則の順と理由は docs/architecture/testing.md「E2E の走らせ方」。

import { entries } from "remeda"

import { isDocumentPath } from "./document-change.ts"
import { type ModuleGraph, reachableFrom } from "./module-graph.ts"

export type E2eSelection =
  | { readonly kind: "all"; readonly path: string; readonly reason: string }
  | { readonly kind: "files"; readonly files: readonly string[] }

export type E2eSelectionSource = {
  readonly graph: ModuleGraph
  /** E2E ファイルの本文（期待値の持ち主を場面の名前で探す）。 */
  readonly sources: ReadonlyMap<string, string>
  /** `test/e2e/*.test.ts` の全部。 */
  readonly e2eFiles: readonly string[]
  /** 画面の領域 → 根の部品ファイル。 */
  readonly regionRoots: Readonly<Record<string, readonly string[]>>
  /** E2E ファイル → 見ている領域。`"every"` はどの領域も見る。 */
  readonly watchedRegions: Readonly<Record<string, readonly string[] | "every">>
}

/** サーバの入口。ここから届く `src/` のファイルは、どの E2E の場面にも効く。 */
const SERVER_ENTRY = "src/cli.ts"

/** E2E の足場の根。ここから届くファイルを変えたら全件を流す。 */
const HARNESS_ROOTS = [
  "package.json",
  "pnpm-lock.yaml",
  "mise.toml",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.e2e.config.ts",
  "scripts/build-ui.ts",
  "test/built-ui-setup.ts",
  "test/check-lock-setup.ts",
]

const EXPECTED_DIRECTORY = "test/e2e/expected/"

/** E2E から届かなければ E2E に効かないディレクトリ。 */
const UNRELATED_DIRECTORIES = [
  "test/",
  "scripts/",
  "story/",
  ".storybook/",
  ".github/",
  ".claude/",
  "docs/",
  "develop/",
]

/** 実行時に読まれて import に出ないことがあるディレクトリ。 */
const RUNTIME_READ_DIRECTORIES = ["test/e2e/", "test/fixture/"]

export function selectE2eFiles(
  changedPaths: readonly string[],
  source: E2eSelectionSource,
): E2eSelection {
  const reach = buildReach(source)
  const decisions = changedPaths.map((changed) => decide(changed, source, reach))
  const fallback = decisions.find((decision) => decision.kind === "all")
  if (fallback !== undefined) {
    return fallback
  }
  const picked = new Set(
    decisions.flatMap((decision) => (decision.kind === "files" ? decision.files : [])),
  )
  return { kind: "files", files: source.e2eFiles.filter((file) => picked.has(file)) }
}

/** `pnpm run check` などが出す1行。 */
export function describeE2eSelection(selection: E2eSelection, total: number): string {
  if (selection.kind === "all") {
    return `E2E: 全件（${String(total)} ファイル）を流す（${selection.path}: ${selection.reason}）`
  }
  if (selection.files.length === 0) {
    return "E2E: 変えたファイルから選ぶものが無いので省く"
  }
  if (selection.files.length === total) {
    return `E2E: 変えたファイルから全 ${String(total)} ファイルを選んだ`
  }
  const names = selection.files
    .map((file) => file.replace(/^test\/e2e\//, "").replace(/\.test\.ts$/, ""))
    .join("・")
  return `E2E: 変えたファイルから ${String(selection.files.length)}/${String(total)} ファイルを選んだ（${names}）`
}

type Reach = {
  readonly harness: ReadonlySet<string>
  readonly server: ReadonlySet<string>
  readonly regions: ReadonlyMap<string, ReadonlySet<string>>
  readonly e2eFiles: ReadonlyMap<string, ReadonlySet<string>>
}

function buildReach(source: E2eSelectionSource): Reach {
  return {
    harness: reachableFrom(source.graph, HARNESS_ROOTS),
    server: reachableFrom(source.graph, [SERVER_ENTRY]),
    regions: new Map(
      entries(source.regionRoots).map(
        ([name, roots]) => [name, reachableFrom(source.graph, roots)] as const,
      ),
    ),
    e2eFiles: new Map(
      source.e2eFiles.map((file) => [file, reachableFrom(source.graph, [file])] as const),
    ),
  }
}

function decide(changed: string, source: E2eSelectionSource, reach: Reach): E2eSelection {
  if (isDocumentPath(changed)) {
    return { kind: "files", files: [] }
  }
  if (changed.startsWith("src/")) {
    return decideSource(changed, source, reach)
  }
  if (reach.harness.has(changed)) {
    return { kind: "all", path: changed, reason: "E2E の足場" }
  }
  if (source.e2eFiles.includes(changed)) {
    return { kind: "files", files: [changed] }
  }
  if (changed.startsWith(EXPECTED_DIRECTORY)) {
    const owners = expectedOwners(changed, source)
    return owners.length > 0
      ? { kind: "files", files: owners }
      : { kind: "all", path: changed, reason: "持ち主の E2E が見つからない期待値" }
  }
  const importers = source.e2eFiles.filter((file) => reach.e2eFiles.get(file)?.has(changed))
  if (importers.length > 0) {
    return { kind: "files", files: importers }
  }
  if (RUNTIME_READ_DIRECTORIES.some((directory) => changed.startsWith(directory))) {
    return { kind: "all", path: changed, reason: "E2E が実行時に読みうるファイル" }
  }
  if (UNRELATED_DIRECTORIES.some((directory) => changed.startsWith(directory))) {
    return { kind: "files", files: [] }
  }
  return { kind: "all", path: changed, reason: "選べないパス" }
}

function decideSource(changed: string, source: E2eSelectionSource, reach: Reach): E2eSelection {
  if (reach.server.has(changed)) {
    return { kind: "all", path: changed, reason: "サーバが読むファイル" }
  }
  const regions = [...reach.regions]
    .filter(([, reached]) => reached.has(changed))
    .map(([name]) => name)
  if (regions.length === 0) {
    return { kind: "all", path: changed, reason: "どの領域の根からも届かないファイル" }
  }
  return {
    kind: "files",
    files: source.e2eFiles.filter((file) => {
      const watched = source.watchedRegions[file]
      return watched === "every" || (watched ?? []).some((region) => regions.includes(region))
    }),
  }
}

/** 期待値 `test/e2e/expected/<場面>.<種類>.json` を書く E2E。場面の名前か、その頭のテンプレートを本文に持つもの。 */
function expectedOwners(changed: string, source: E2eSelectionSource): string[] {
  const scenario = changed.slice(EXPECTED_DIRECTORY.length).replace(/\.[^.]+\.[^.]+$/, "")
  return source.e2eFiles.filter((file) => {
    const body = source.sources.get(file) ?? ""
    if (body.includes(`"${scenario}"`)) {
      return true
    }
    return [...body.matchAll(/`([a-z0-9-]+)\$\{/g)].some((match) =>
      scenario.startsWith(match[1] ?? "\0"),
    )
  })
}
