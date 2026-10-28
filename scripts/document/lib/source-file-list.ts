// 文書の検査が読む対象のファイルを、リポジトリ直下からの相対パスで列挙する、という概念1つを持つ。

import { type Dirent, globSync } from "node:fs"
import { join, relative, sep } from "node:path"

// 親が何であっても（ドットで始まる親の下も含めて）、この名前のディレクトリの中は読まない。
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", "dist", ".git", "vendor"])

/**
 * `root` 以下の読む対象のファイルを、`root` からの相対パスで返す（シンボリックリンクは辿らない）。
 * 画像などは読まない。`**` は `.` で始まるディレクトリに降りないので、その下を別のパターンで足す。
 */
export function listSourcePaths(root: string): string[] {
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
