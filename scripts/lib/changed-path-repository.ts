// 主ブランチの名前を決め、マージベースからの差分・未コミットの変更・未追跡のファイルを合わせて
// 「変えたファイル」の一覧にする、という概念1つを持つ。`git` と `node:fs` だけを呼ぶ。
//
// 主ブランチの決め方は `~/.claude/skills/task-workflow/WORKFLOW.md`「主ブランチの名前は `main` に
// 固定しない」と同じ順（CLAUDE.md の明示 → `origin/HEAD` → 実在する既定候補）。`task ship` の
// 付け替え後（マージベースが主ブランチの先端になる）でもこの決め方なら崩れない。

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const FALLBACK_PRIMARY_BRANCH_NAMES = ["main", "master", "trunk"]

/** `root` の CLAUDE.md「## タスク運用」の `- 主ブランチ:` 行、`origin/HEAD`、既定候補の順で主ブランチ名を決める。 */
export function resolvePrimaryBranch(root: string): string {
  const declared = readDeclaredPrimaryBranch(root)
  if (declared !== undefined) {
    return declared
  }

  const originHead = runGit(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
  if (originHead !== undefined) {
    const branch = originHead.trim().replace(/^origin\//u, "")
    if (branch !== "") {
      return branch
    }
  }

  const fallback = FALLBACK_PRIMARY_BRANCH_NAMES.find(
    (name) => runGit(root, ["rev-parse", "--verify", "--quiet", name]) !== undefined,
  )
  if (fallback === undefined) {
    throw new Error("主ブランチが決められない（CLAUDE.md の指定も origin/HEAD も既定候補も無い）")
  }
  return fallback
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

function readDeclaredPrimaryBranch(root: string): string | undefined {
  const claudeMdPath = join(root, "CLAUDE.md")
  if (!existsSync(claudeMdPath)) {
    return undefined
  }
  const text = readFileSync(claudeMdPath, "utf8")
  const section = text.split(/^## /mu).find((block) => block.startsWith("タスク運用"))
  if (section === undefined) {
    return undefined
  }
  const match = /^-\s*主ブランチ:\s*(.+)$/mu.exec(section)
  if (match?.[1] === undefined) {
    return undefined
  }
  return parseDeclaredBranchValue(match[1])
}

function parseDeclaredBranchValue(rawValue: string): string {
  const backquoted = /^`([^`]+)`/u.exec(rawValue.trim())
  if (backquoted?.[1] !== undefined) {
    return backquoted[1]
  }
  const firstWord = /^[^\s(),、。]+/u.exec(rawValue.trim())
  return firstWord?.[0] ?? rawValue.trim()
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
