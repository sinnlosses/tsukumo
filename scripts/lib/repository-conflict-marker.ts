// `.tw/` 以下のファイルを読み、`findConflictMarkers` に渡して衝突の印を集める、という
// 概念1つを持つ。

import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { findConflictMarkers, type ConflictMarker } from "../conflict-marker.ts"

// 衝突の印を探す対象のディレクトリ（リポジトリ直下からの相対）。
const SCANNED_DIRECTORY = ".tw"

// 作業ツリーごとの控えとログの置き場。コミットされず、ログに印に似た行が入りうる。
const SKIPPED_DIRECTORY = "local"

/** `root` の `.tw/` 以下を読み、衝突の印をすべて返す。`.tw/` が無ければ空。 */
export function collectConflictMarkers(root: string): ConflictMarker[] {
  const directory = join(root, SCANNED_DIRECTORY)
  return listFilePaths(root, directory).flatMap((path) =>
    findConflictMarkers(path, readFileSync(join(root, path), "utf8")),
  )
}

/** `directory` 以下のファイルを、`root` からの相対パスで返す（シンボリックリンクは辿らない）。 */
function listFilePaths(root: string, directory: string): string[] {
  if (directory === join(root, SCANNED_DIRECTORY, SKIPPED_DIRECTORY)) {
    return []
  }
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? listFilePaths(root, path)
      : entry.isFile()
        ? [relative(root, path)]
        : []
  })
}
