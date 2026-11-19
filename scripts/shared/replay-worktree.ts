// タスクの再試のための一時の作業ツリー（着手前のコミットで起こす）を、起こして消す、という概念1つを持つ。`git` だけを呼ぶ。
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

const OWNER_FILE = "owner.pid"
const BRANCH_PREFIX = "harness-replay/"

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
  const branch = `${BRANCH_PREFIX}${id}-${randomUUID().slice(0, 8)}`
  writeFileSync(join(directory, OWNER_FILE), String(process.pid))
  git(repositoryRoot, ["worktree", "add", "-b", branch, path, base])
  return { path, branch }
}

/**
 * 持ち主のプロセスが生きていない一時の作業ツリーと、作業ツリーの無い再試の枝を消す。消した数を返す。
 * 背景の上限で止められた再試は後始末が走らないため、次の起動で片付ける。
 */
export function sweepStaleReplayWorktrees(repositoryRoot: string): number {
  let removed = 0
  const attached = new Set<string>()
  for (const entry of listWorktrees(repositoryRoot)) {
    if (entry.branch === undefined || !entry.branch.startsWith(BRANCH_PREFIX)) continue
    attached.add(entry.branch)
    if (isOwnerAlive(join(entry.path, ".."))) continue
    removeReplayWorktree(repositoryRoot, { path: entry.path, branch: entry.branch })
    removed += 1
  }
  for (const branch of listReplayBranches(repositoryRoot)) {
    if (attached.has(branch)) continue
    git(repositoryRoot, ["branch", "-D", branch])
    removed += 1
  }
  return removed
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

/** `after` のコミットから、判定のテストを一時の作業ツリーへ取り出す。 */
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

function listWorktrees(
  repositoryRoot: string,
): readonly { readonly path: string; readonly branch?: string }[] {
  return gitOutput(repositoryRoot, ["worktree", "list", "--porcelain"])
    .split("\n\n")
    .flatMap((block) => {
      const lines = block.split("\n")
      const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length)
      const ref = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length)
      if (path === undefined) return []
      return [
        ref?.startsWith("refs/heads/")
          ? { path, branch: ref.slice("refs/heads/".length) }
          : { path },
      ]
    })
}

function listReplayBranches(repositoryRoot: string): readonly string[] {
  return gitOutput(repositoryRoot, [
    "for-each-ref",
    "--format=%(refname:short)",
    `refs/heads/${BRANCH_PREFIX}`,
  ])
    .split("\n")
    .filter((name) => name !== "")
}

function isOwnerAlive(directory: string): boolean {
  let pid: number
  try {
    pid = Number(readFileSync(join(directory, OWNER_FILE), "utf8").trim())
  } catch {
    return false
  }
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

function git(cwd: string, args: readonly string[]): void {
  execFileSync("git", [...args], { cwd, stdio: ["ignore", "ignore", "pipe"] })
}

function gitOutput(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}
