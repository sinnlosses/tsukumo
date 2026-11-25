// ファイルの大きさの検査にかける、ステージした変更を git から読む。
// git が失敗して読めないファイルは、検査を巻き込まないよう結果から外す。

import { type ChangedEntry, parseBinaryPaths, parseNameStatus } from "./git-diff-output.ts"
import { queryGit } from "./git-query.ts"
import type { StagedChange } from "./token-limit.ts"

type StagedEntry = ChangedEntry & { readonly binary: boolean }

/** ステージしたファイルを HEAD と比べた変更。 */
export function readStagedChanges(directory: string): readonly StagedChange[] {
  return readStagedEntries(directory).flatMap((entry): readonly StagedChange[] => {
    const stagedBytes = readBlobBytes(directory, `:${entry.path}`)
    if (stagedBytes === undefined) {
      return []
    }
    return toChange(directory, entry, stagedBytes, entry.binary)
  })
}

function toChange(
  directory: string,
  entry: ChangedEntry,
  bytes: number,
  binary: boolean,
): readonly StagedChange[] {
  if (entry.status === "A") {
    return [{ path: entry.path, headBytes: undefined, stagedBytes: bytes, binary }]
  }
  const headBytes = readBlobBytes(directory, `HEAD:${entry.previousPath}`)
  return headBytes === undefined
    ? []
    : [{ path: entry.path, headBytes, stagedBytes: bytes, binary }]
}

/** 追加・変更・名前変更・コピーだけを返す。一覧が git から取れなければ空。 */
function readStagedEntries(directory: string): readonly StagedEntry[] {
  const nameStatus = queryGit(directory, [
    "diff",
    "--cached",
    "--name-status",
    "-z",
    "--find-renames",
  ])
  const numstat = queryGit(directory, ["diff", "--cached", "--numstat", "-z", "--find-renames"])
  if (nameStatus === undefined || numstat === undefined) {
    return []
  }

  const binaryPaths = parseBinaryPaths(numstat)
  return parseNameStatus(nameStatus).map((entry) => ({
    ...entry,
    binary: binaryPaths.has(entry.path),
  }))
}

function readBlobBytes(directory: string, object: string): number | undefined {
  const output = queryGit(directory, ["cat-file", "-s", object])
  const bytes = output === undefined ? Number.NaN : Number.parseInt(output.trim(), 10)
  return Number.isNaN(bytes) ? undefined : bytes
}
