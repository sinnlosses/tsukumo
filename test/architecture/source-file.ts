// 規約のテストが共有する、ソースファイルの列挙と import の specifier の読み取り。

import { readdirSync, readFileSync, statSync } from "node:fs"

import { parseProgram, type AstNode } from "../../scripts/shared/ast-node.ts"
import { DYNAMIC, readReferences } from "../../scripts/shared/module-reference.ts"
import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"

export const SRC_ROOT = `${REPOSITORY_ROOT}/src`

/** `src/` 配下の `.ts` / `.tsx` を再帰的に集める。相対パス（`shared/<機能>/<名前>.ts`）で返す。 */
export function listSourceFiles(
  root: string,
  dir = root,
  extensions: readonly string[] = [".ts", ".tsx"],
): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = `${dir}/${name}`
    if (statSync(fullPath).isDirectory()) {
      return listSourceFiles(root, fullPath, extensions)
    }
    return extensions.some((extension) => name.endsWith(extension))
      ? [fullPath.slice(root.length + 1)]
      : []
  })
}

/** `./` / `../` で始まる specifier を、`importSpecifiers` と同じ範囲から拾う。 */
export function relativeImportSpecifiers(content: string): readonly string[] {
  return importSpecifiers(content).filter((specifier) => specifier.startsWith("."))
}

/**
 * 構文木から、静的 import（副作用だけのものと `import type` を含む）・`export … from`・
 * 動的 `import("…")`・`require("…")` の specifier を、相対かどうかを問わずすべて拾う。
 * `new URL("…", import.meta.url)` は拾わない（`src/` の外を指すものがあり、層を判定できない）。
 * 文字列リテラルでない引数のものは拾えない。
 */
export function importSpecifiers(content: string): readonly string[] {
  const cached = SPECIFIER_CACHE.get(content)
  if (cached !== undefined) {
    return cached
  }
  const specifiers = readImportSpecifiers(content)
  SPECIFIER_CACHE.set(content, specifiers)
  return specifiers
}

/** 構文エラーがあれば throw する。 */
export function parseSourceProgram(content: string, fileName = "source.ts"): AstNode {
  const program = parseProgram(fileName, content)
  if (program === undefined) {
    throw new Error(`${fileName} を読めない`)
  }
  return program
}

/**
 * `searchPrefix` で始まるファイルのうち `targetRelPath` を import している読み手の機能の名前（重複を畳んだもの）と、
 * 機能の外（`featureOf` が `undefined` を返すファイル）からの読み手の数。
 */
export function featureReadersOf(
  targetRelPath: string,
  searchPrefix: string,
  featureOf: (relPath: string) => string | undefined,
): { readonly features: readonly string[]; readonly outsideFeatureCount: number } {
  const readers = listSourceFiles(SRC_ROOT)
    .filter((relPath) => relPath.startsWith(searchPrefix) && relPath !== targetRelPath)
    .filter((relPath) =>
      relativeImportSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).some(
        (specifier) => resolveRelativeImport(relPath, specifier) === targetRelPath,
      ),
    )

  return {
    features: [...new Set(readers.flatMap((relPath) => featureOf(relPath) ?? []))],
    outsideFeatureCount: readers.filter((relPath) => featureOf(relPath) === undefined).length,
  }
}

/** import 元の相対パスと specifier から、import 先の `src/` 相対パスを解く。 */
export function resolveRelativeImport(fromRelPath: string, specifier: string): string {
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

// 機能ごとの読み手の探索が同じファイルを何度も読むので、本文ごとに結果を覚える。
const SPECIFIER_CACHE = new Map<string, readonly string[]>()

function readImportSpecifiers(content: string): readonly string[] {
  return readReferences(parseSourceProgram(content), "imports").filter(
    (specifier) => specifier !== DYNAMIC,
  )
}
