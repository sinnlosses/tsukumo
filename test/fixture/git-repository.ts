// テストの中で使い捨ての git リポジトリを作って操作する。

import { mkdirSync } from "node:fs"

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
