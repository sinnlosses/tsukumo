// 規約のテストが共有する、ソースファイルの列挙と import の specifier の読み取り。

import { readdirSync, readFileSync, statSync } from "node:fs"

import { inject } from "vitest"

import { parseProgram, type AstNode } from "../../scripts/shared/ast-node.ts"
import { DYNAMIC, readReferences } from "../../scripts/shared/module-reference.ts"
import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"

export const SRC_ROOT = `${REPOSITORY_ROOT}/src`

/** `src/` からの相対パスから本文への表。globalSetup が実行ごとに1回読み、`inject("sourceTable")` で配る。 */
export type SourceTable = Readonly<Record<string, string>>

// 並んで走る e2e が書いて消す生成物と、`astryx theme build` の組み立て物。
// e2e の生成物は走査で拾うと stat の前にファイルが消えて落ちる。組み立て物は `--check` が見張る。
const GENERATED_DIRECTORIES = [
  `${REPOSITORY_ROOT}/test/e2e/output`,
  `${SRC_ROOT}/browser/components/ui/theme-root/built`,
]

// `sourceTable` に入れる拡張子。これに収まる拡張子での `src/` の列挙だけが表から引ける。
const TABLE_EXTENSIONS = [".ts", ".tsx", ".css"] as const

/**
 * `root` 配下の `.ts` / `.tsx` を再帰的に集める（生成物のディレクトリは下りない）。相対パス（`shared/<機能>/<名前>.ts`）で返す。
 * `src/` の中は実行の始めに読んだ `sourceTable` から引くので、実行中に足したファイルは出ない。
 */
export function listSourceFiles(
  root: string,
  dir = root,
  extensions: readonly string[] = [".ts", ".tsx"],
): readonly string[] {
  return isTableScope(root, dir, extensions)
    ? listTableFiles(root, extensions)
    : walkSourceFiles(root, dir, extensions)
}

/** `src/` からの相対パスの本文を `sourceTable` から引く。表に無ければ throw する。 */
export function readSourceFile(relPath: string): string {
  const content = inject("sourceTable")[relPath]
  if (content === undefined) {
    throw new Error(`src/${relPath} は sourceTable に無い`)
  }
  return content
}

export function readSourceTable(): SourceTable {
  return Object.fromEntries(
    walkSourceFiles(SRC_ROOT, SRC_ROOT, TABLE_EXTENSIONS).map((relPath) => [
      relPath,
      readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"),
    ]),
  )
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
      relativeImportSpecifiers(readSourceFile(relPath)).some(
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

function isTableScope(root: string, dir: string, extensions: readonly string[]): boolean {
  return (
    dir === root &&
    (root === SRC_ROOT || root.startsWith(`${SRC_ROOT}/`)) &&
    extensions.every((extension) => TABLE_EXTENSIONS.some((covered) => extension.endsWith(covered)))
  )
}

function listTableFiles(root: string, extensions: readonly string[]): readonly string[] {
  const prefix = root === SRC_ROOT ? "" : `${root.slice(SRC_ROOT.length + 1)}/`
  return Object.keys(inject("sourceTable"))
    .filter(
      (relPath) =>
        relPath.startsWith(prefix) && extensions.some((extension) => relPath.endsWith(extension)),
    )
    .map((relPath) => relPath.slice(prefix.length))
}

function walkSourceFiles(
  root: string,
  dir: string,
  extensions: readonly string[],
): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = `${dir}/${name}`
    if (GENERATED_DIRECTORIES.includes(fullPath)) {
      return []
    }
    if (statSync(fullPath).isDirectory()) {
      return walkSourceFiles(root, fullPath, extensions)
    }
    return extensions.some((extension) => name.endsWith(extension))
      ? [fullPath.slice(root.length + 1)]
      : []
  })
}

// 機能ごとの読み手の探索が同じファイルを何度も読むので、本文ごとに結果を覚える。
const SPECIFIER_CACHE = new Map<string, readonly string[]>()

function readImportSpecifiers(content: string): readonly string[] {
  return readReferences(parseSourceProgram(content), "imports").filter(
    (specifier) => specifier !== DYNAMIC,
  )
}
