// E2E の期待値の置き場の、主ブランチとのマージベースからの差分行数を git と作業ツリーから読む。

import { readFileSync } from "node:fs"
import path from "node:path"

import { queryGit } from "../../shared/git-query.ts"
import { countExpectedDiffLines, EXPECTED_DIRECTORY } from "./expected-diff.ts"

/**
 * マージベースからの差分（コミット済み・未コミット）と未追跡のファイルを合わせた、期待値の置き場の差分行数。
 * マージベースが引けなければ undefined。
 */
export function readExpectedDiffLines(root: string, primaryBranch: string): number | undefined {
  const mergeBase = queryGit(root, ["merge-base", "HEAD", primaryBranch])?.trim()
  if (mergeBase === undefined || mergeBase === "") {
    return undefined
  }
  const numstat = queryGit(root, ["diff", "--numstat", mergeBase, "--", EXPECTED_DIRECTORY]) ?? ""
  const untrackedPaths = (
    queryGit(root, ["ls-files", "--others", "--exclude-standard", "--", EXPECTED_DIRECTORY]) ?? ""
  )
    .split("\n")
    .filter((line) => line !== "")
  return countExpectedDiffLines(
    numstat,
    untrackedPaths.map((relativePath) => readFileSync(path.join(root, relativePath), "utf8")),
  )
}
