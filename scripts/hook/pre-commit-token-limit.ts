// ステージしたファイルが大きくなりすぎていないかを、git の pre-commit から検査する。
//
// 拒否するときは stderr に理由を出して終了コード 1 で止める。
// git が失敗して判定できないファイルは、コミットを巻き込まないよう通す。

import process from "node:process"

import { type ChangedEntry, parseBinaryPaths, parseNameStatus } from "../shared/git-diff-output.ts"
import { queryGit } from "../shared/git-query.ts"
import {
  findOversizedFiles,
  formatTokenLimitRefusal,
  type StagedChange,
} from "./lib/token-limit.ts"

type StagedEntry = ChangedEntry & { readonly binary: boolean }

const cwd = process.cwd()
const oversized = findOversizedFiles(readStagedChanges(cwd))
if (oversized.length > 0) {
  process.stderr.write(`${formatTokenLimitRefusal(oversized)}\n`)
  process.exit(1)
}

function readStagedChanges(directory: string): readonly StagedChange[] {
  const entries = readStagedEntries(directory)
  return entries.flatMap((entry): readonly StagedChange[] => {
    const stagedBytes = readBlobBytes(directory, `:${entry.path}`)
    if (stagedBytes === undefined) {
      return []
    }
    if (entry.status === "A") {
      return [{ path: entry.path, headBytes: undefined, stagedBytes, binary: entry.binary }]
    }
    const headBytes = readBlobBytes(directory, `HEAD:${entry.previousPath}`)
    return headBytes === undefined
      ? []
      : [{ path: entry.path, headBytes, stagedBytes, binary: entry.binary }]
  })
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
