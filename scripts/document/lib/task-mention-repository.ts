// `src/` / `test/` / `scripts/` / `docs/` / `story/`（`docs/history/` を除く）のファイルを読み、
// `findTaskMentions` に渡して迷子のタスク番号を集める、という概念1つを持つ。

import { type Dirent, globSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

import {
  findStrayTaskMentions,
  findTaskMentions,
  maskAllowedRequirementsPendingTaskColumn,
  type TaskMention,
} from "../task-mention.ts"

// 検査するディレクトリ（リポジトリ直下から）。
const SCANNED_DIRECTORIES = [
  "src",
  "test",
  "scripts",
  "docs",
  "story",
] as const satisfies readonly string[]

// 親が何であっても（ドットで始まる親の下も含めて）、この名前のディレクトリの中は読まない。
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", "dist", ".git"])

// `docs/history/` は名前ではなく場所で除く（同じ名前のディレクトリを巻き込まないため）。
const SKIPPED_PATH = "docs/history"

/** `root` 以下の `src/` / `test/` / `scripts/` / `docs/` を読み、迷子のタスク番号をすべて返す。 */
export function collectStrayTaskMentions(root: string): TaskMention[] {
  const mentions = SCANNED_DIRECTORIES.flatMap((directory) =>
    listSourcePaths(root, directory).flatMap((path) =>
      findTaskMentions(
        path,
        maskAllowedRequirementsPendingTaskColumn(path, readFileSync(join(root, path), "utf8")),
      ),
    ),
  )
  return findStrayTaskMentions(mentions)
}

/**
 * `directory` 以下の読む対象のファイルを、`root` からの相対パスで返す（シンボリックリンクは辿らない）。
 * `**` は `.` で始まるディレクトリに降りないので、その下を別のパターンで足す。
 */
function listSourcePaths(root: string, directory: string): string[] {
  const skipped = (entry: Dirent): boolean => {
    const path = relative(root, join(entry.parentPath, entry.name))
    return (
      path.split(sep).some((segment) => SKIPPED_DIRECTORY_NAMES.has(segment)) ||
      path === SKIPPED_PATH ||
      path.startsWith(`${SKIPPED_PATH}${sep}`)
    )
  }
  return [`${directory}/**/{*,.*}.{ts,tsx,css,md}`, `${directory}/**/.*/**/{*,.*}.{ts,tsx,css,md}`]
    .flatMap((pattern) =>
      globSync(pattern, { cwd: root, exclude: skipped, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(root, join(entry.parentPath, entry.name))),
    )
    .toSorted()
}
