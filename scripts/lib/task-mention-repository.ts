// `src/` / `test/` / `scripts/` のファイルを読み、`scripts/task-mention.ts` の純粋関数に渡して
// 迷子のタスク番号を集める、という概念1つを持つ。`test/task-id.test.ts` が使う。

import { readdirSync, readFileSync } from "node:fs"
import { extname, join, relative } from "node:path"

import { findStrayTaskMentions, findTaskMentions, type TaskMention } from "../task-mention.ts"

// 検査するディレクトリ（リポジトリ直下から）。
const SCANNED_DIRECTORIES = ["src", "test", "scripts"] as const satisfies readonly string[]

// 検査するファイルの拡張子（コード・スタイル）。
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css"])

// 降りないディレクトリ（依存物・成果物・git の中身）。
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".git"])

/** `root` 以下の `src/` / `test/` / `scripts/` を読み、迷子のタスク番号をすべて返す。 */
export function collectStrayTaskMentions(root: string): TaskMention[] {
  const mentions = SCANNED_DIRECTORIES.flatMap((directory) =>
    listSourcePaths(root, join(root, directory)).flatMap((path) =>
      findTaskMentions(path, readFileSync(join(root, path), "utf8")),
    ),
  )
  return findStrayTaskMentions(mentions)
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
