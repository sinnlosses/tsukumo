// 主ブランチを出している作業ツリーの解決と、作業ツリーが clean かどうかの判定を、
// 使い捨てリポジトリの実物の git で検証する。

import { mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test, vi } from "vitest"

import {
  isWorktreeClean,
  resolveMainWorktreePath,
  syncSubmodules,
} from "../../scripts/lib/main-worktree.ts"
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

  describe("syncSubmodules", () => {
    async function commitSubmodule(mainWorktree: string): Promise<string> {
      const upstream = join(tempDir(), "upstream")
      mkdirSync(upstream, { recursive: true })
      await git(upstream, "init", "--quiet", "--initial-branch=main")
      await git(upstream, "config", "user.email", "test@example.com")
      await git(upstream, "config", "user.name", "test")
      writeFileSync(join(upstream, "a.txt"), "1\n")
      await git(upstream, "add", ".")
      await git(upstream, "commit", "--quiet", "-m", "first")
      await git(
        mainWorktree,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "--quiet",
        upstream,
        "sub",
      )
      await git(mainWorktree, "commit", "--quiet", "-m", "add sub")
      return upstream
    }

    test("ポインタを進めて中身が古いまま残った本体を、記録した版へ揃える", async () => {
      const { mainWorktree } = await createRepositoryWithMainWorktree()
      await commitSubmodule(mainWorktree)
      const sub = join(mainWorktree, "sub")
      await git(sub, "config", "user.email", "test@example.com")
      await git(sub, "config", "user.name", "test")
      writeFileSync(join(sub, "a.txt"), "2\n")
      await git(sub, "commit", "--quiet", "-am", "second")
      await git(mainWorktree, "commit", "--quiet", "-am", "advance sub")
      await git(sub, "checkout", "--quiet", "HEAD~1")
      expect(isWorktreeClean(mainWorktree)).toBe(false)

      syncSubmodules(mainWorktree)

      expect(isWorktreeClean(mainWorktree)).toBe(true)
    })

    test(".gitmodules が無ければ何もしない", async () => {
      const { mainWorktree } = await createRepositoryWithMainWorktree()
      const write = vi.spyOn(process.stderr, "write")
      syncSubmodules(mainWorktree)
      expect(write).not.toHaveBeenCalled()
      expect(isWorktreeClean(mainWorktree)).toBe(true)
      write.mockRestore()
    })

    test("揃えられなければ例外にせず、標準エラーに1行だけ書く", async () => {
      const { mainWorktree } = await createRepositoryWithMainWorktree()
      writeFileSync(
        join(mainWorktree, ".gitmodules"),
        `[submodule "sub"]\n\tpath = sub\n\turl = ${join(tempDir(), "missing")}\n`,
      )
      await git(mainWorktree, "add", ".gitmodules")
      await git(
        mainWorktree,
        "update-index",
        "--add",
        "--cacheinfo",
        "160000,1234567890123456789012345678901234567890,sub",
      )
      const write = vi.spyOn(process.stderr, "write").mockReturnValue(true)

      expect(() => {
        syncSubmodules(mainWorktree)
      }).not.toThrow()
      expect(write).toHaveBeenCalledTimes(1)
      expect(String(write.mock.calls[0]?.[0])).toBe(
        `サブモジュールを揃えられなかった: ${mainWorktree}\n`,
      )
      write.mockRestore()
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
