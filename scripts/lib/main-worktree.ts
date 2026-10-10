// 主ブランチを出している作業ツリーのパスを見つける概念と、作業ツリーが clean かどうかを
// 見る概念を持つ。`git` だけを呼ぶ。

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import process from "node:process"

/**
 * `root` から見た `worktree list --porcelain` の中から、`primaryBranch` を出している作業ツリーの
 * パスを返す。見つからなければ例外を投げる。 */
export function resolveMainWorktreePath(root: string, primaryBranch: string): string {
  const output = execFileSync("git", ["-C", root, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
  })
  const targetBranch = `refs/heads/${primaryBranch}`
  for (const block of output.split("\n\n")) {
    const worktreeLine = block.split("\n").find((line) => line.startsWith("worktree "))
    const branchLine = block.split("\n").find((line) => line === `branch ${targetBranch}`)
    if (worktreeLine !== undefined && branchLine !== undefined) {
      return worktreeLine.slice("worktree ".length)
    }
  }
  throw new Error(`${primaryBranch} を出している作業ツリーが見つからない`)
}

/**
 * `worktreePath` に `.gitmodules` があれば `git submodule update --init` で記録した版へ揃える。
 * 揃えられなければ例外にせず、標準エラーに1行だけ書く。 */
export function syncSubmodules(worktreePath: string): void {
  if (!existsSync(path.join(worktreePath, ".gitmodules"))) {
    return
  }
  try {
    execFileSync("git", ["-C", worktreePath, "submodule", "update", "--init"], {
      stdio: ["ignore", "inherit", "ignore"],
    })
  } catch {
    process.stderr.write(`サブモジュールを揃えられなかった: ${worktreePath}\n`)
  }
}

/** `worktreePath` の作業ツリーに未コミット・未追跡の変更が無いかどうか。 */
export function isWorktreeClean(worktreePath: string): boolean {
  const output = execFileSync("git", ["-C", worktreePath, "status", "--porcelain"], {
    encoding: "utf8",
  })
  return output.trim() === ""
}
