// リポジトリのファイルを読み、`scripts/section-reference.ts` の純粋関数に渡して迷子の参照を
// 集める、という概念1つを持つ。`scripts/find-stray-reference.ts`（一覧を出す入口）と
// `test/section-reference.test.ts`（0件を保つテスト）が同じ読み方を要るので、ここに1つだけ置く。

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { extname, join, relative } from "node:path"

import {
  findSectionReferences,
  findStrayReferences,
  isScannedSource,
  type StrayReference,
} from "../section-reference.ts"

// 参照を探すファイルの拡張子（コード・スタイル・ドキュメント）。画像などは読まない。
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".md", ".json", ".html"])

// 降りないディレクトリ（依存物・成果物・git の中身）。
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".git"])

/** `root` 以下を読み、句が参照先に見つからない参照をすべて返す。 */
export function collectStrayReferences(root: string): StrayReference[] {
  const references = listSourcePaths(root, root)
    .filter(isScannedSource)
    .flatMap((path) => findSectionReferences(path, readFileSync(join(root, path), "utf8")))
  const targetPaths = new Set(references.map((reference) => reference.targetPath))
  const targets = new Map(
    [...targetPaths]
      .filter((path) => existsSync(join(root, path)))
      .map((path) => [path, readFileSync(join(root, path), "utf8")] as const),
  )
  return findStrayReferences(references, targets)
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
