// `.tw/` 以下のファイルを読み、`findConflictMarkers` に渡して衝突の印を集める、という
// 概念1つを持つ。

import { globSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { findConflictMarkers, type ConflictMarker } from "../conflict-marker.ts"

// 衝突の印を探す対象のディレクトリ（リポジトリ直下からの相対）。
const SCANNED_DIRECTORY = ".tw"

// 作業ツリーごとの控えとログの置き場。コミットされず、ログに印に似た行が入りうる。
const SKIPPED_PATH = `${SCANNED_DIRECTORY}/local/**`

/** `root` の `.tw/` 以下を読み、衝突の印をすべて返す。`.tw/` が無ければ空。 */
export function collectConflictMarkers(root: string): ConflictMarker[] {
  return listFilePaths(root).flatMap((path) =>
    findConflictMarkers(path, readFileSync(join(root, path), "utf8")),
  )
}

/**
 * `.tw/` 以下のファイルを、`root` からの相対パスで返す（シンボリックリンクは辿らない）。
 * `**` は `.` で始まるディレクトリに降りないので、その下を別のパターンで足す。
 */
function listFilePaths(root: string): string[] {
  return [`${SCANNED_DIRECTORY}/**/{*,.*}`, `${SCANNED_DIRECTORY}/**/.*/**/{*,.*}`]
    .flatMap((pattern) =>
      globSync(pattern, { cwd: root, exclude: [SKIPPED_PATH], withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(root, join(entry.parentPath, entry.name))),
    )
    .toSorted()
}
