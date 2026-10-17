// git 管理下のファイルを開き、指した行の前後の抜き書き（`FileExcerpt`）を返す。
//
// 開くのは git 管理下の一覧にあるパスだけ（`isTrackedPath`）で、シンボリックリンクはたどらない（管理下のリンクは作業ディレクトリの外を指しうる）。
// 例外を投げない。読めないときは `unavailable` を返す。

import { constants } from "node:fs"
import { open } from "node:fs/promises"
import { join } from "node:path"

import type {
  FileExcerpt,
  FileExcerptRequest,
  FileExcerptUnavailableReason,
} from "../../../shared/repository/file-excerpt.ts"
import { isTrackedPath } from "../../core/tracked-path.ts"
import { excerptLines } from "../core/file-excerpt.ts"

/** 開いて読むファイルの大きさの上限。超えたら読まずに `too-large`。 */
export const MAX_EXCERPT_FILE_BYTES = 1024 * 1024

/**
 * `cwd` 相対の `request.path` が `listFiles` の一覧にあれば読み、指した行の前後を返す。
 * NUL を含むファイルはバイナリとみなして `binary`。
 */
export async function readFileExcerpt(
  cwd: string,
  request: FileExcerptRequest,
  listFiles: () => Promise<readonly string[]>,
): Promise<FileExcerpt> {
  if (!(await isTrackedPath(request.path, listFiles))) {
    return unavailable("untracked")
  }
  const content = await readSmallRegularFile(join(cwd, request.path))
  if (content.kind === "unavailable") {
    return content
  }
  if (content.bytes.includes(0)) {
    return unavailable("binary")
  }
  return excerptLines(content.bytes.toString("utf8"), request)
}

type SmallFileContent =
  | { readonly kind: "read"; readonly bytes: Buffer }
  | { readonly kind: "unavailable"; readonly reason: FileExcerptUnavailableReason }

/** 通常のファイルを、上限の大きさまでなら丸ごと読む。リンク・ディレクトリ・開けないものは `unreadable`。 */
async function readSmallRegularFile(path: string): Promise<SmallFileContent> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => undefined)
  if (handle === undefined) {
    return unavailable("unreadable")
  }
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) {
      return unavailable("unreadable")
    }
    if (stats.size > MAX_EXCERPT_FILE_BYTES) {
      return unavailable("too-large")
    }
    return { kind: "read", bytes: await handle.readFile() }
  } catch {
    return unavailable("unreadable")
  } finally {
    await handle.close()
  }
}

function unavailable(reason: FileExcerptUnavailableReason): {
  readonly kind: "unavailable"
  readonly reason: FileExcerptUnavailableReason
} {
  return { kind: "unavailable", reason }
}
