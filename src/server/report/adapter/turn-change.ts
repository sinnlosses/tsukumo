// ターンの頭の HEAD と、そこから今までに変わったファイルを `git` で読む口（`ReportChanges`）。
// git の外・`git` が無い・時間切れのときは `undefined`（呼ぶ側が「画面の変更なし」として扱う）。例外を投げない。

import { runGit } from "../../repository/adapter/git.ts"
import type { ReportChanges } from "../core/report-review.ts"

/** `cwd` のリポジトリの変更を読む口を作る。 */
export function createReportChanges(cwd: string): ReportChanges {
  return {
    readHead: () => readHead(cwd),
    readChangedFiles: (head) => readChangedFiles(cwd, head),
  }
}

async function readHead(cwd: string): Promise<string | undefined> {
  const outcome = await runGit(cwd, ["rev-parse", "HEAD"])
  const head = outcome.kind === "output" ? outcome.stdout.trim() : ""
  return head === "" ? undefined : head
}

/**
 * `head` から今までに変わったファイル。コミット済みの差分と作業ツリーの未コミットの変更（`git diff <head>`）に、
 * 未追跡のファイルを足す。パスはリポジトリの根からの相対。
 * `-z` で NUL 区切りにする（変わった名前を引用符で包ませない）。
 */
async function readChangedFiles(cwd: string, head: string): Promise<readonly string[] | undefined> {
  const [changed, untracked] = await Promise.all([
    runGit(cwd, ["diff", "--name-only", "-z", head, "--"]),
    runGit(cwd, ["ls-files", "--others", "--exclude-standard", "--full-name", "-z"]),
  ])
  if (changed.kind !== "output" || untracked.kind !== "output") {
    return undefined
  }
  return [...new Set([...splitNul(changed.stdout), ...splitNul(untracked.stdout)])]
}

function splitNul(stdout: string): readonly string[] {
  return stdout.split("\0").filter((path) => path !== "")
}
