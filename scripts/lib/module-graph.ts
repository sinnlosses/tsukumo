// ファイルどうしの import のつながり（どのファイルがどのファイルを読むか）と、根から届くファイルの集合。
// パスはどれもリポジトリ直下からの相対パス（区切りは `/`）。
// 本文は構文木にせず相対指定の文字列だけを拾うので、コメントや文字列の中の指定も辿る（多めに届く側に倒れる）。

import path from "node:path"

/** ファイル → そのファイルが相対指定で読む、実在するファイルの列。 */
export type ModuleGraph = ReadonlyMap<string, readonly string[]>

const SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\bfrom\s*["']([^"'\n]+)["']/g,
  /\bimport\s*["']([^"'\n]+)["']/g,
  /\bimport\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\bnew URL\(\s*["']([^"'\n]+)["']\s*,\s*import\.meta\.url\s*\)/g,
]

/** `fromPath` の本文 `source` が相対指定で読むファイルのうち、`knownPaths` に在るもの。 */
export function importedPaths(
  fromPath: string,
  source: string,
  knownPaths: ReadonlySet<string>,
): string[] {
  const directory = path.posix.dirname(fromPath)
  const resolved = SPECIFIER_PATTERNS.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] ?? ""),
  )
    .filter((specifier) => specifier.startsWith("./") || specifier.startsWith("../"))
    .map((specifier) => path.posix.normalize(path.posix.join(directory, specifier)))
    .filter((candidate) => knownPaths.has(candidate))
  return [...new Set(resolved)]
}

/** `roots` 自身と、そこから import を辿って届くファイルの集合。 */
export function reachableFrom(graph: ModuleGraph, roots: readonly string[]): ReadonlySet<string> {
  const reached = new Set<string>()
  const pending = [...roots]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (reached.has(next)) {
      continue
    }
    reached.add(next)
    pending.push(...(graph.get(next) ?? []))
  }
  return reached
}
