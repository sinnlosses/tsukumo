import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createReplayWorktree,
  sweepStaleReplayWorktrees,
  type ReplayWorktree,
} from "../../../scripts/shared/replay-worktree.ts"
import { runSubprocess } from "../../fixture/subprocess.ts"

const DEAD_PID = 2_147_483_646

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runSubprocess("git", args, { cwd })
  return result.stdout
}

describe("sweepStaleReplayWorktrees", () => {
  let repository: string
  const directories: string[] = []

  beforeEach(async () => {
    repository = mkdtempSync(join(tmpdir(), "replay-worktree-test-"))
    await git(repository, "init", "-q", "-b", "main")
    await git(
      repository,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "init",
    )
  })

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
    rmSync(repository, { recursive: true, force: true })
  })

  function create(id: string): ReplayWorktree {
    const worktree = createReplayWorktree(repository, id, "main")
    directories.push(join(worktree.path, ".."))
    return worktree
  }

  async function branches(): Promise<string[]> {
    const output = await git(repository, "branch", "--format=%(refname:short)")
    return output.split("\n").filter(Boolean)
  }

  it("起こしたプロセスの pid を一時のディレクトリに置く", () => {
    const worktree = create("A")
    expect(existsSync(join(worktree.path, "..", "owner.pid"))).toBe(true)
  })

  it("生きた持ち主の作業ツリーは残す", async () => {
    const worktree = create("A")
    expect(sweepStaleReplayWorktrees(repository)).toBe(0)
    expect(existsSync(worktree.path)).toBe(true)
    expect(await branches()).toContain(worktree.branch)
  })

  it("死んだ持ち主の作業ツリーと枝は消す", async () => {
    const worktree = create("A")
    writeFileSync(join(worktree.path, "..", "owner.pid"), String(DEAD_PID))
    expect(sweepStaleReplayWorktrees(repository)).toBe(1)
    expect(existsSync(worktree.path)).toBe(false)
    expect(await branches()).not.toContain(worktree.branch)
  })

  it("作業ツリーの無い再試の枝は消し、ほかの枝は触らない", async () => {
    await git(repository, "branch", "harness-replay/orphan")
    await git(repository, "branch", "feature/keep")
    expect(sweepStaleReplayWorktrees(repository)).toBe(1)
    const remaining = await branches()
    expect(remaining).not.toContain("harness-replay/orphan")
    expect(remaining).toContain("feature/keep")
  })
})
