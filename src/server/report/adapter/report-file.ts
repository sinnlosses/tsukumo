// `code` の塊が引くファイルを cwd から読む。ホスト・OS に触るのはここだけ。

import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"

import type { ReportOutlineLeaf } from "../../../shared/report/report-outline.ts"

/** 読む上限（これを超えるファイルは読まない）。 */
const MAX_REPORT_MATCH_FILE_BYTES = 1024 * 1024

/**
 * `Code` の葉で `path` が空でないものを集め、cwd から解いて読む。
 * 読めなかった（無い・ファイルでない・大きすぎる・バイナリ）`path` は戻り値の `Map` に入らない。
 */
export async function readReportBlockFiles(
  cwd: string,
  leaves: readonly ReportOutlineLeaf[],
): Promise<ReadonlyMap<string, string>> {
  const paths = [
    ...new Set(
      leaves.flatMap((leaf) =>
        leaf.component === "Code" && leaf.path.trim() !== "" ? [leaf.path] : [],
      ),
    ),
  ]
  const entries = await Promise.all(
    paths.map(async (path) => [path, await readOne(cwd, path)] as const),
  )
  return new Map(
    entries.flatMap(([path, content]) => (content === undefined ? [] : [[path, content] as const])),
  )
}

async function readOne(cwd: string, path: string): Promise<string | undefined> {
  const resolved = resolve(cwd, path)
  try {
    const info = await stat(resolved)
    if (!info.isFile() || info.size > MAX_REPORT_MATCH_FILE_BYTES) {
      return undefined
    }
    const buffer = await readFile(resolved)
    return buffer.includes(0) ? undefined : buffer.toString("utf8")
  } catch {
    return undefined
  }
}
