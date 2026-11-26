import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { sweepAbandonedWorktrees } from "../../../scripts/shared/abandoned-worktree.ts"
import { runSubprocess } from "../../fixture/subprocess.ts"

const HOUR = 60 * 60 * 1000

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runSubprocess("git", args, { cwd })
  return result.stdout
}

describe("sweepAbandonedWorktrees", () => {
  let repository: string
  let scratch: string
  const temporaryRoots = [realpathSync(tmpdir())]

  beforeEach(async () => {
    repository = realpathSync(mkdtempSync(join(tmpdir(), "abandoned-worktree-test-")))
    scratch = realpathSync(mkdtempSync(join(tmpdir(), "abandoned-worktree-scratch-")))
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
    rmSync(scratch, { recursive: true, force: true })
    rmSync(repository, { recursive: true, force: true })
  })

  async function addWorktree(name: string, ...options: string[]): Promise<string> {
    const path = join(scratch, name)
    await git(repository, "worktree", "add", "-q", ...options, path, "main")
    return path
  }

  function age(path: string, hours: number): void {
    const past = (Temporal.Now.instant().epochMilliseconds - hours * HOUR) / 1000
    const gitdir = resolve(path, readFileSync(join(path, ".git"), "utf8").trim().slice(8))
    for (const target of [path, join(path, ".git"), join(gitdir, "HEAD"), join(gitdir, "index")]) {
      if (existsSync(target)) utimesSync(target, past, past)
    }
  }

  async function listed(): Promise<string> {
    return git(repository, "worktree", "list", "--porcelain")
  }

  it("長く触られていない枝の無い一時の木を消す", async () => {
    const path = await addWorktree("before", "--detach")
    age(path, 4)
    expect(sweepAbandonedWorktrees(repository, { temporaryRoots })).toBe(1)
    expect(existsSync(path)).toBe(false)
    expect(await listed()).not.toContain(path)
  })

  it("最近触られた木・枝のある木・鍵の掛かった木は残す", async () => {
    const recent = await addWorktree("recent", "--detach")
    const branched = await addWorktree("branched", "-b", "feature")
    const locked = await addWorktree("locked", "--detach", "--lock")
    age(branched, 4)
    age(locked, 4)
    expect(sweepAbandonedWorktrees(repository, { temporaryRoots })).toBe(0)
    expect([recent, branched, locked].every((path) => existsSync(path))).toBe(true)
  })

  it("一時のディレクトリの外の木は残す", async () => {
    const path = await addWorktree("outside", "--detach")
    age(path, 4)
    expect(sweepAbandonedWorktrees(repository, { temporaryRoots: ["/nonexistent-root"] })).toBe(0)
    expect(existsSync(path)).toBe(true)
  })

  it("実体の消えた木の記録を外す", async () => {
    const path = await addWorktree("gone", "--detach")
    rmSync(path, { recursive: true, force: true })
    sweepAbandonedWorktrees(repository, { temporaryRoots })
    expect(await listed()).not.toContain(path)
  })
})
