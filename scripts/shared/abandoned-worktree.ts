// 一時のディレクトリに置かれたまま放っておかれた、枝の無い（detached HEAD の）作業ツリーを消す、という概念1つを持つ。`git` だけを呼ぶ。
// 手で `git worktree add --detach` した木には後始末の持ち主がいない。枝のある作業ツリーは触らない。
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"

/** これより長く触られていない木を、放っておかれたとみなす。撮り比べの最中の木を消さないための猶予。 */
const ABANDONED_AFTER_MS = 3 * 60 * 60 * 1000

type WorktreeEntry = {
  readonly path: string
  readonly detached: boolean
  readonly locked: boolean
}

/**
 * 放っておかれた一時の作業ツリーを消し、実体の消えた木の記録を `git worktree prune` で外す。消した数を返す。
 * 本体の作業ツリー・枝のある木・鍵の掛かった木・一時のディレクトリの外の木・最近触られた木は残す。
 */
export function sweepAbandonedWorktrees(
  repositoryRoot: string,
  options: { readonly temporaryRoots?: readonly string[]; readonly now?: number } = {},
): number {
  const roots = options.temporaryRoots ?? defaultTemporaryRoots()
  const now = options.now ?? Temporal.Now.instant().epochMilliseconds
  const abandoned = listWorktrees(repositoryRoot)
    .slice(1)
    .filter(
      (entry) =>
        entry.detached &&
        !entry.locked &&
        roots.some((root) => isInside(entry.path, root)) &&
        existsSync(entry.path) &&
        now - lastActivityOf(entry.path) >= ABANDONED_AFTER_MS,
    )
  let removed = 0
  for (const entry of abandoned) {
    try {
      git(repositoryRoot, ["worktree", "remove", "--force", entry.path])
      removed += 1
    } catch {
      // 別の作業ツリーの検査が同時に消した、などは次の回に任せる
    }
  }
  git(repositoryRoot, ["worktree", "prune"])
  return removed
}

function defaultTemporaryRoots(): readonly string[] {
  const roots = [tmpdir(), "/tmp", "/var/folders"].filter((path) => existsSync(path))
  return [...new Set(roots.map((path) => realpathSync(path)))]
}

function isInside(path: string, root: string): boolean {
  const target = resolve(path)
  const base = resolve(root)
  return target.startsWith(base.endsWith(sep) ? base : base + sep)
}

/** 木の根・`.git`・gitdir の HEAD と index のうち、いちばん新しい更新の時刻。 */
function lastActivityOf(path: string): number {
  const candidates = [path, join(path, ".git"), ...gitdirFilesOf(path)]
  return Math.max(
    ...candidates.filter((candidate) => existsSync(candidate)).map((c) => statSync(c).mtimeMs),
  )
}

function gitdirFilesOf(path: string): readonly string[] {
  try {
    const line = readFileSync(join(path, ".git"), "utf8").trim()
    if (!line.startsWith("gitdir: ")) return []
    const gitdir = resolve(path, line.slice("gitdir: ".length))
    return [join(gitdir, "HEAD"), join(gitdir, "index")]
  } catch {
    return []
  }
}

function listWorktrees(repositoryRoot: string): readonly WorktreeEntry[] {
  return execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\n\n")
    .flatMap((block) => {
      const lines = block.split("\n")
      const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length)
      if (path === undefined) return []
      return [
        {
          path,
          detached: lines.includes("detached"),
          locked: lines.some((line) => line === "locked" || line.startsWith("locked ")),
        },
      ]
    })
}

function git(cwd: string, args: readonly string[]): void {
  execFileSync("git", [...args], { cwd, stdio: ["ignore", "ignore", "pipe"] })
}
