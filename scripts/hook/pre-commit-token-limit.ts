// ステージしたファイルが大きくなりすぎていないかを、git の pre-commit から検査する。
//
// 拒否するときは stderr に理由を出して終了コード 1 で止める。
// git が失敗して判定できないファイルは、コミットを巻き込まないよう通す。

import process from "node:process"

import { queryGit } from "../shared/git-query.ts"
import {
  findOversizedFiles,
  formatTokenLimitRefusal,
  type StagedChange,
} from "./lib/token-limit.ts"

type StagedEntry = {
  readonly status: string
  readonly path: string
  readonly previousPath: string
  readonly binary: boolean
}

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

  const binaryPaths = readBinaryPaths(numstat)
  const tokens = nameStatus.split("\0")
  const entries: StagedEntry[] = []
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index] ?? ""
    if (status === "") {
      break
    }
    const moves = status.startsWith("R") || status.startsWith("C")
    const previousPath = tokens[index + 1] ?? ""
    const path = moves ? (tokens[index + 2] ?? "") : previousPath
    index += moves ? 3 : 2
    if (path !== "" && /^[AMRC]/.test(status)) {
      entries.push({
        status: status.slice(0, 1),
        path,
        previousPath,
        binary: binaryPaths.has(path),
      })
    }
  }
  return entries
}

/** `numstat -z` の出力から、バイナリ（`-\t-\t`）のファイルの新しいパスを集める。 */
function readBinaryPaths(numstat: string): ReadonlySet<string> {
  const tokens = numstat.split("\0")
  const binaryPaths = new Set<string>()
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index] ?? ""
    if (token === "") {
      break
    }
    const [added = "", deleted = "", path = ""] = token.split("\t")
    const moves = path === ""
    const newPath = moves ? (tokens[index + 2] ?? "") : path
    index += moves ? 3 : 1
    if (added === "-" && deleted === "-") {
      binaryPaths.add(newPath)
    }
  }
  return binaryPaths
}

function readBlobBytes(directory: string, object: string): number | undefined {
  const output = queryGit(directory, ["cat-file", "-s", object])
  const bytes = output === undefined ? Number.NaN : Number.parseInt(output.trim(), 10)
  return Number.isNaN(bytes) ? undefined : bytes
}
