// 主ブランチの名前を読み、マージベースからの差分・未コミットの変更・未追跡のファイルを合わせて
// 「変えたファイル」の一覧にする、という概念1つを持つ。`git` と設定の読み口だけを呼ぶ。
// 主ブランチの名前はプロジェクトの設定（`.tsukumo/project.json`）の `tasks.mainBranch` で、推し量らない。

import { execFileSync } from "node:child_process"

import { readProjectSettings } from "../../src/server/repository/adapter/project-settings.ts"

/** `root` のプロジェクトの設定から主ブランチ名を読む。設定が無い・読めないときは例外。 */
export async function resolvePrimaryBranch(root: string): Promise<string> {
  const settings = await readProjectSettings(root)
  if (settings.kind !== "read") {
    throw new Error("主ブランチが決められない（.tsukumo/project.json が無い・読めない）")
  }
  return settings.tasks.mainBranch
}

/** `primaryBranch` とのマージベースからの差分・未コミットの変更・未追跡のファイルを合わせて返す。 */
export function collectChangedPaths(root: string, primaryBranch: string): string[] {
  const mergeBase = runGit(root, ["merge-base", "HEAD", primaryBranch])?.trim()
  if (mergeBase === undefined || mergeBase === "") {
    throw new Error(`${primaryBranch} とのマージベースが見つからない`)
  }

  const diffPaths = splitLines(runGit(root, ["diff", "--name-only", mergeBase]))
  const untrackedPaths = splitLines(runGit(root, ["ls-files", "--others", "--exclude-standard"]))
  return [...new Set([...diffPaths, ...untrackedPaths])]
}

function runGit(root: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", [...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return undefined
  }
}

function splitLines(output: string | undefined): string[] {
  if (output === undefined || output === "") {
    return []
  }
  return output.split("\n").filter((line) => line !== "")
}
