// リポジトリのファイルを読み、迷子の参照・無いファイルを指すパス・無いシンボルを集める、という概念1つを持つ。
// 一覧を出す入口と0件を保つ検査が同じ読み方を要るので、ここに1つだけ置く。

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { extname, join, relative } from "node:path"

import {
  type FileReference,
  findFileReferences,
  findMissingFileReferences,
  findSectionReferences,
  findStrayReferences,
  isScannedSource,
  type StrayReference,
} from "../section-reference.ts"
import {
  findSymbolReferences,
  findStraySymbolReferences,
  isSymbolCheckedDocument,
  type StraySymbolReference,
} from "../symbol-reference.ts"

// 参照を探すファイルの拡張子（コード・スタイル・ドキュメント）。画像などは読まない。
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".md", ".json", ".html"])

// 降りないディレクトリ（依存物・成果物・git の中身）。
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".git", "vendor"])

/** `root` 以下を読み、句が参照先に見つからない参照をすべて返す。 */
export function collectStrayReferences(root: string): StrayReference[] {
  const references = listSourcePaths(root, root)
    .filter(isScannedSource)
    .flatMap((path) => findSectionReferences(path, readFileSync(join(root, path), "utf8")))
  return findStrayReferences(references, readExistingTargets(root, references))
}

/** `root` 以下を読み、無いファイルを指す `docs/` 以下の `.md` のパスをすべて返す。 */
export function collectMissingFileReferences(root: string): FileReference[] {
  const references = listSourcePaths(root, root)
    .filter(isScannedSource)
    .flatMap((path) => findFileReferences(path, readFileSync(join(root, path), "utf8")))
  const existingPaths = new Set(
    references
      .map((reference) => reference.targetPath)
      .filter((path) => existsSync(join(root, path))),
  )
  return findMissingFileReferences(references, existingPaths)
}

/** `root` 以下の文書を読み、指している置き場所（ファイルとシンボル）が見つからない参照をすべて返す。 */
export function collectStraySymbolReferences(root: string): StraySymbolReference[] {
  const references = listSourcePaths(root, root)
    .filter(isSymbolCheckedDocument)
    .flatMap((path) => findSymbolReferences(path, readFileSync(join(root, path), "utf8")))
  return findStraySymbolReferences(references, readExistingTargets(root, references))
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

/** `directory` 以下の読む対象のファイルを、`root` からの相対パスで返す（シンボリックリンクは辿らない）。 */
function listSourcePaths(root: string, directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : listSourcePaths(root, path)
    }
    return entry.isFile() && SCANNED_EXTENSIONS.has(extname(entry.name))
      ? [relative(root, path)]
      : []
  })
}
