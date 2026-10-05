// タスク一覧を読むテストが使う、`main` に1件コミットしたリポジトリと、架空の課題の置き方。
// `initBeadsRepository` と `initBeadsIssues` は `useBeadsHome` を呼んだファイルの中でだけ使える。

import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { initBeadsWithIssues } from "./beads-repository.ts"
import { git, initGitRepository } from "./git-repository.ts"
import { writeProjectSettings } from "./project-settings.ts"

const CREATED_AT = "2026-01-14T00:00:00Z"

/** 未着手の課題1件（`bd export` の1行の形）。`extra` で項目を足す・上書きする。 */
export function openIssue(
  id: string,
  title: string,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return { id, title, status: "open", created_at: CREATED_AT, ...extra }
}

/** `main` に1件コミットしたリポジトリ（プロジェクトの設定も `.beads` も置かない）。 */
export async function initRepository(root: string): Promise<string> {
  const repository = join(root, "repository")
  await initGitRepository(repository)
  writeFileSync(join(repository, "README.md"), "架空のリポジトリ")
  await git(repository, "add", "README.md")
  await git(repository, "commit", "-m", "init")
  return repository
}

/** {@link initRepository} のリポジトリに、`issues` を入れた `.beads` を置く（プロジェクトの設定は置かない）。 */
export async function initBeadsIssues(
  root: string,
  issues: readonly Readonly<Record<string, unknown>>[],
): Promise<string> {
  const repository = await initRepository(root)
  await initBeadsWithIssues(repository, issues)
  return repository
}

/** プロジェクトの設定を置き、`issues` を入れた `.beads` を作ったリポジトリ。 */
export async function initBeadsRepository(
  root: string,
  issues: readonly Readonly<Record<string, unknown>>[],
): Promise<string> {
  const repository = await initBeadsIssues(root, issues)
  writeProjectSettings(repository)
  return repository
}

/** `main` を出している本体とは別に、`git merge main` をしない作業ツリーを切る。 */
export async function addWorktree(root: string, repository: string): Promise<string> {
  const worktree = join(root, "worktree")
  await git(repository, "worktree", "add", "-b", "feature", worktree)
  return worktree
}
