// `src/` / `test/` / `scripts/` / `docs/`（`docs/history/` を除く）のファイルを読み、
// `scripts/task-mention.ts` の純粋関数に渡して迷子のタスク番号を集める、という概念1つを持つ。
// `test/task-id.test.ts` が使う。

import { readdirSync, readFileSync } from "node:fs"
import { extname, join, relative } from "node:path"

import {
  findStrayTaskMentions,
  findTaskMentions,
  maskAllowedRequirementsPendingTaskColumn,
  type TaskMention,
} from "../task-mention.ts"

// 検査するディレクトリ（リポジトリ直下から）。
const SCANNED_DIRECTORIES = ["src", "test", "scripts", "docs"] as const satisfies readonly string[]

// 検査するファイルの拡張子（コード・スタイル・ドキュメント）。
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".md"])

// 降りないディレクトリ（依存物・成果物・git の中身）。ディレクトリ名だけで判定するので、
// 場所を問わずこの名前のディレクトリを丸ごと飛ばす。
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".git"])

// 降りないパス（`root` からの相対パス）。`docs/history/` はここでだけ許された過去の記録の置き場
// なので、名前ではなく場所で除く（`history` という名前だけで判定すると、他所にできた同名の
// ディレクトリまで巻き込む）。
const SKIPPED_PATHS = new Set(["docs/history"])

/** `root` 以下の `src/` / `test/` / `scripts/` / `docs/` を読み、迷子のタスク番号をすべて返す。 */
export function collectStrayTaskMentions(root: string): TaskMention[] {
  const mentions = SCANNED_DIRECTORIES.flatMap((directory) =>
    listSourcePaths(root, join(root, directory)).flatMap((path) =>
      findTaskMentions(
        path,
        maskAllowedRequirementsPendingTaskColumn(path, readFileSync(join(root, path), "utf8")),
      ),
    ),
  )
  return findStrayTaskMentions(mentions)
}

/** `directory` 以下の読む対象のファイルを、`root` からの相対パスで返す（シンボリックリンクは辿らない）。 */
function listSourcePaths(root: string, directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name) || SKIPPED_PATHS.has(relative(root, path))) {
        return []
      }
      return listSourcePaths(root, path)
    }
    return entry.isFile() && SCANNED_EXTENSIONS.has(extname(entry.name))
      ? [relative(root, path)]
      : []
  })
}
