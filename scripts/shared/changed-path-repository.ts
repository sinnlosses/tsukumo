// 主ブランチとのマージベースからの差分・未コミットの変更・未追跡のファイルを合わせて
// 「変えたファイル」の一覧にする、という概念1つを持つ。`git` だけを呼ぶ。

import { unique } from "remeda"

import { queryGit } from "./git-query.ts"

export const PRIMARY_BRANCH = "main"

/** `primaryBranch` とのマージベースからの差分・未コミットの変更・未追跡のファイルを合わせて返す。 */
export function collectChangedPaths(root: string, primaryBranch: string): string[] {
  const mergeBase = queryGit(root, ["merge-base", "HEAD", primaryBranch])?.trim()
  if (mergeBase === undefined || mergeBase === "") {
    throw new Error(`${primaryBranch} とのマージベースが見つからない`)
  }

  const diffPaths = splitLines(queryGit(root, ["diff", "--name-only", mergeBase]) ?? "")
  const untrackedPaths = splitLines(
    queryGit(root, ["ls-files", "--others", "--exclude-standard"]) ?? "",
  )
  return unique([...diffPaths, ...untrackedPaths])
}

function splitLines(output: string): string[] {
  return output.split("\n").filter((line) => line !== "")
}
