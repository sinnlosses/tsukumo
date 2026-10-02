// 主ブランチを出している作業ツリーの解決と、作業ツリーが clean かどうかの判定を、
// 使い捨てリポジトリの実物の git で検証する。

import { mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { isWorktreeClean, resolveMainWorktreePath } from "../../scripts/lib/main-worktree.ts"
import { runSubprocessOrThrow } from "../fixture/subprocess.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

// 一時リポジトリで git と worktree を何度も走らせるので、既定の 5000ms を超えることがある。
const GIT_LOAD_TIMEOUT_MS = 20_000

describe("main-worktree", { timeout: GIT_LOAD_TIMEOUT_MS }, () => {
  const tempDir = useTempDir("main-worktree")

  async function git(root: string, ...args: string[]): Promise<void> {
    await runSubprocessOrThrow("git", args, { cwd: root })
  }

  async function createRepositoryWithMainWorktree(): Promise<{
    readonly root: string
    readonly mainWorktree: string
  }> {
    const root = join(tempDir(), "repo")
    const mainWorktree = join(tempDir(), "main-wt")
    mkdirSync(root, { recursive: true })
    await git(root, "init", "--quiet", "--initial-branch=main")
    await git(root, "config", "user.email", "test@example.com")
    await git(root, "config", "user.name", "test")
    writeFileSync(join(root, "README.md"), "readme\n")
    await git(root, "add", ".")
    await git(root, "commit", "--quiet", "-m", "base")
    await git(root, "switch", "--quiet", "-c", "work")
    await git(root, "worktree", "add", "--quiet", mainWorktree, "main")
    return { root, mainWorktree }
  }

  describe("resolveMainWorktreePath", () => {
    test("main ブランチを出している作業ツリーのパスを返す", async () => {
      const { root, mainWorktree } = await createRepositoryWithMainWorktree()
      expect(resolveMainWorktreePath(root, "main")).toBe(realpathSync(mainWorktree))
    })

    test("そのブランチを出している作業ツリーが無ければ例外を投げる", async () => {
      const { root } = await createRepositoryWithMainWorktree()
      expect(() => resolveMainWorktreePath(root, "trunk")).toThrow()
    })
  })

  describe("isWorktreeClean", () => {
    test("何も変えていなければ true", async () => {
      const { mainWorktree } = await createRepositoryWithMainWorktree()
      expect(isWorktreeClean(mainWorktree)).toBe(true)
    })

    test("未コミットの変更があれば false", async () => {
      const { mainWorktree } = await createRepositoryWithMainWorktree()
      writeFileSync(join(mainWorktree, "README.md"), "changed\n")
      expect(isWorktreeClean(mainWorktree)).toBe(false)
    })

    test("未追跡のファイルがあれば false", async () => {
      const { mainWorktree } = await createRepositoryWithMainWorktree()
      writeFileSync(join(mainWorktree, "untracked.txt"), "x\n")
      expect(isWorktreeClean(mainWorktree)).toBe(false)
    })
  })
})
