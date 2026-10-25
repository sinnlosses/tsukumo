// リポジトリのファイルを読み、迷子の参照・無いファイルを指すパス・無いシンボルを集める、という概念1つを持つ。
// 一覧を出す入口と0件を保つ検査が同じ読み方を要るので、ここに1つだけ置く。

import { type Dirent, existsSync, globSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

import {
  type FileReference,
  findFileReferences,
  findMissingFileReferences,
  findSectionReferences,
  findStrayReferences,
  isScannedSource,
  type StrayReference,
} from "../section-reference.ts"
import { findSourcePathReferences } from "../source-path-reference.ts"
import {
  findSymbolReferences,
  findStraySymbolReferences,
  isSymbolCheckedDocument,
  type StraySymbolReference,
} from "../symbol-reference.ts"

// 親が何であっても（ドットで始まる親の下も含めて）、この名前のディレクトリの中は読まない。
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", "dist", ".git", "vendor"])

/** `root` 以下を読み、句が参照先に見つからない参照をすべて返す。 */
export function collectStrayReferences(root: string): StrayReference[] {
  const references = listSourcePaths(root)
    .filter(isScannedSource)
    .flatMap((path) => findSectionReferences(path, readFileSync(join(root, path), "utf8")))
  const targets = readExistingTargets(root, references)
  return findStrayReferences(references, new Map([...targets, ...readChildTargets(root, targets)]))
}

/** `root` 以下を読み、無いファイルを指す `docs/` 以下の `.md` のパスをすべて返す。 */
export function collectMissingFileReferences(root: string): FileReference[] {
  return collectMissingPaths(root, findFileReferences)
}

/** `root` 以下を読み、無いファイルを指す `test/`・`scripts/`・`src/` のパスをすべて返す。 */
export function collectMissingSourcePathReferences(root: string): FileReference[] {
  return collectMissingPaths(root, findSourcePathReferences)
}

/** `root` 以下の文書を読み、指している置き場所（ファイルとシンボル）が見つからない参照をすべて返す。 */
export function collectStraySymbolReferences(root: string): StraySymbolReference[] {
  const references = listSourcePaths(root)
    .filter(isSymbolCheckedDocument)
    .flatMap((path) => findSymbolReferences(path, readFileSync(join(root, path), "utf8")))
  return findStraySymbolReferences(references, readExistingTargets(root, references))
}

/** 読む対象のファイルから `find` で拾ったパスのうち、`root` に実在しないものを返す。 */
function collectMissingPaths(
  root: string,
  find: (sourcePath: string, text: string) => FileReference[],
): FileReference[] {
  const references = listSourcePaths(root)
    .filter(isScannedSource)
    .flatMap((path) => find(path, readFileSync(join(root, path), "utf8")))
  const existingPaths = new Set(
    references
      .map((reference) => reference.targetPath)
      .filter((path) => existsSync(join(root, path))),
  )
  return findMissingFileReferences(references, existingPaths)
}

/** 親 `docs/X.md` の子 `docs/X/*.md`（直下のみ）を、パスから本文への対応にして返す。 */
function readChildTargets(root: string, parents: ReadonlyMap<string, string>): Map<string, string> {
  return new Map(
    [...parents.keys()]
      .filter((path) => path.endsWith(".md"))
      .flatMap((path) => globSync(`${path.slice(0, -".md".length)}/*.md`, { cwd: root }).toSorted())
      .map((path) => [path, readFileSync(join(root, path), "utf8")] as const),
  )
}

/** 参照の指す先のうち実在するものを、パスから本文への対応にして返す。 */
function readExistingTargets(
  root: string,
  references: readonly { readonly targetPath: string }[],
): Map<string, string> {
  const targetPaths = new Set(references.map((reference) => reference.targetPath))
  return new Map(
    [...targetPaths]
      .filter((path) => existsSync(join(root, path)))
      .map((path) => [path, readFileSync(join(root, path), "utf8")] as const),
  )
}

/**
 * `root` 以下の読む対象のファイルを、`root` からの相対パスで返す（シンボリックリンクは辿らない）。
 * 画像などは読まない。`**` は `.` で始まるディレクトリに降りないので、その下を別のパターンで足す。
 */
function listSourcePaths(root: string): string[] {
  const skipped = (entry: Dirent): boolean =>
    relative(root, join(entry.parentPath, entry.name))
      .split(sep)
      .some((segment) => SKIPPED_DIRECTORY_NAMES.has(segment))
  return ["**/{*,.*}.{ts,tsx,css,md,json,html}", "**/.*/**/{*,.*}.{ts,tsx,css,md,json,html}"]
    .flatMap((pattern) =>
      globSync(pattern, { cwd: root, exclude: skipped, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(root, join(entry.parentPath, entry.name))),
    )
    .toSorted()
}
