// 作業ツリーのファイルが大きくなりすぎていないかを、HEAD と比べて検査する。コミット前の関門と同じ判定。
//
// 拒否するときは stderr に理由を出して終了コード 1 で止める。
// git が失敗して判定できないファイルは通す。

import { readFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import {
  findOversizedFiles,
  formatTokenLimitRefusal,
  type StagedChange,
} from "../hook/lib/token-limit.ts"
import { type ChangedEntry, parseBinaryPaths, parseNameStatus } from "../shared/git-diff-output.ts"
import { queryGit } from "../shared/git-query.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"

const oversized = findOversizedFiles(readWorktreeChanges(REPOSITORY_ROOT))
if (oversized.length > 0) {
  process.stderr.write(`${formatTokenLimitRefusal(oversized)}\n`)
  process.exit(1)
}

function readWorktreeChanges(directory: string): readonly StagedChange[] {
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
    if (entry.status === "A") {
      return [{ path: entry.path, headBytes: undefined, stagedBytes: content.length, binary }]
    }
    const headBytes = readHeadBytes(directory, entry.previousPath)
    return headBytes === undefined
      ? []
      : [{ path: entry.path, headBytes, stagedBytes: content.length, binary }]
  })
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

function readHeadBytes(directory: string, path: string): number | undefined {
  const output = queryGit(directory, ["cat-file", "-s", `HEAD:${path}`])
  const bytes = output === undefined ? Number.NaN : Number.parseInt(output.trim(), 10)
  return Number.isNaN(bytes) ? undefined : bytes
}
