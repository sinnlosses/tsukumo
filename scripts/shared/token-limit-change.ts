// ファイルの大きさの検査にかける変更を git とファイルシステムから読む。
// git が失敗して読めないファイルは、検査を巻き込まないよう結果から外す。

import { readFileSync } from "node:fs"
import { join } from "node:path"

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

/** 作業ツリーのファイル（未追跡を含む）を HEAD と比べた変更。 */
export function readWorktreeChanges(directory: string): readonly StagedChange[] {
  const nameStatus = queryGit(directory, ["diff", "HEAD", "--name-status", "-z", "--find-renames"])
  const numstat = queryGit(directory, ["diff", "HEAD", "--numstat", "-z", "--find-renames"])
  const tracked = nameStatus === undefined ? [] : parseNameStatus(nameStatus)
  const binaryPaths = numstat === undefined ? new Set<string>() : parseBinaryPaths(numstat)
  const untracked = readUntrackedPaths(directory).map((path): ChangedEntry => ({
    status: "A",
    path,
    previousPath: path,
  }))
  return [...tracked, ...untracked].flatMap((entry): readonly StagedChange[] => {
    const content = readWorktreeFile(directory, entry.path)
    if (content === undefined) {
      return []
    }
    const binary = binaryPaths.has(entry.path) || content.subarray(0, 8000).includes(0)
    return toChange(directory, entry, content.length, binary)
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

function readUntrackedPaths(directory: string): readonly string[] {
  const output = queryGit(directory, ["ls-files", "--others", "--exclude-standard", "-z"])
  return output === undefined ? [] : output.split("\0").filter((path) => path !== "")
}

function readWorktreeFile(directory: string, path: string): Buffer | undefined {
  try {
    return readFileSync(join(directory, path))
  } catch {
    return undefined
  }
}

function readBlobBytes(directory: string, object: string): number | undefined {
  const output = queryGit(directory, ["cat-file", "-s", object])
  const bytes = output === undefined ? Number.NaN : Number.parseInt(output.trim(), 10)
  return Number.isNaN(bytes) ? undefined : bytes
}
