// テストの中で使い捨ての git リポジトリを作って操作する。

import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

import { runSubprocessOrThrow } from "./subprocess.ts"

export async function git(cwd: string, ...args: readonly string[]): Promise<void> {
  await runSubprocessOrThrow("git", args, { cwd })
}

/**
 * `path` に `branch` を初期ブランチにしたリポジトリを作る（ディレクトリが無ければ作る）。
 * 利用者の git の設定（作者・署名・フック）に左右されないよう、リポジトリの設定で上書きする。
 */
export async function initGitRepository(path: string, branch = "main"): Promise<void> {
  mkdirSync(path, { recursive: true })
  await git(path, "init", "--quiet", "-b", branch)
  await git(path, "config", "user.name", "tsukumo-test")
  await git(path, "config", "user.email", "tsukumo-test@example.invalid")
  await git(path, "config", "commit.gpgsign", "false")
  await git(path, "config", "core.hooksPath", "/dev/null")
}

/** `id` に着手の印を立てる（`task claim` 相当。印の有無だけを作り、`owner` の中身は書かない）。 */
export async function claimTask(cwd: string, id: string): Promise<void> {
  mkdirSync(join(await gitCommonDir(cwd), "task-workflow", "claim", id), { recursive: true })
}

/** `id` の着手の印を消す（`task release` 相当）。 */
export async function releaseTask(cwd: string, id: string): Promise<void> {
  rmSync(join(await gitCommonDir(cwd), "task-workflow", "claim", id), {
    recursive: true,
    force: true,
  })
}

/** 作業ツリーどうしで共有する `.git` の絶対パス（台帳はこの下に置かれる）。 */
async function gitCommonDir(cwd: string): Promise<string> {
  const stdout = await runSubprocessOrThrow(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd },
  )
  return stdout.trim()
}
