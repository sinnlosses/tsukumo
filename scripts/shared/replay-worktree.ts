// タスクの再試のための一時の作業ツリー（着手前のコミットで起こす）を、起こして消す、という概念1つを持つ。`git` だけを呼ぶ。
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** いまのハーネスとして、一時の作業ツリーへ重ねるパス。 */
const HARNESS_PATHS = ["AGENTS.md", "CLAUDE.md", ".claude", ".tw/config.toml"] as const

export type ReplayWorktree = {
  readonly path: string
  readonly branch: string
}

/** `base` のコミットで、専用の枝つきの一時の作業ツリーを起こす。 */
export function createReplayWorktree(
  repositoryRoot: string,
  id: string,
  base: string,
): ReplayWorktree {
  const directory = mkdtempSync(join(tmpdir(), "harness-replay-"))
  const path = join(directory, "tree")
  const branch = `harness-replay/${id}-${randomUUID().slice(0, 8)}`
  git(repositoryRoot, ["worktree", "add", "-b", branch, path, base])
  return { path, branch }
}

/** いまの作業ツリーのハーネス（規約・rules・スキル・設定）を、一時の作業ツリーへ重ねる。 */
export function overlayHarness(repositoryRoot: string, worktree: ReplayWorktree): void {
  for (const relative of HARNESS_PATHS) {
    const source = join(repositoryRoot, relative)
    if (existsSync(source)) {
      cpSync(source, join(worktree.path, relative), { recursive: true, force: true })
    }
  }
}

/** `after` のコミットから、台本のテストを一時の作業ツリーへ取り出す。 */
export function checkoutCheckFiles(
  worktree: ReplayWorktree,
  after: string,
  checkFiles: readonly string[],
): void {
  git(worktree.path, ["checkout", after, "--", ...checkFiles])
}

/** 依存（node_modules）は親の作業ツリーのものを指す。写さない。 */
export function linkDependencies(repositoryRoot: string, worktree: ReplayWorktree): void {
  const modules = join(repositoryRoot, "node_modules")
  if (existsSync(modules)) {
    symlinkSync(modules, join(worktree.path, "node_modules"))
  }
}

/** 一時の作業ツリーと枝を消す。消せなかったときも残りを消して続ける。 */
export function removeReplayWorktree(repositoryRoot: string, worktree: ReplayWorktree): void {
  try {
    git(repositoryRoot, ["worktree", "remove", "--force", worktree.path])
  } catch {
    rmSync(worktree.path, { recursive: true, force: true })
    git(repositoryRoot, ["worktree", "prune"])
  }
  try {
    git(repositoryRoot, ["branch", "-D", worktree.branch])
  } finally {
    rmSync(join(worktree.path, ".."), { recursive: true, force: true })
  }
}

function git(cwd: string, args: readonly string[]): void {
  execFileSync("git", [...args], { cwd, stdio: ["ignore", "ignore", "pipe"] })
}
