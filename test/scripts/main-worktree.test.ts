// 主ブランチを出している作業ツリーの解決と、作業ツリーが clean かどうかの判定を、
// 使い捨てリポジトリの実物の git で検証する。

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

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

  const GIT_IDENTITY_ENV = {
    ...process.env,
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  }

  async function git(root: string, ...args: string[]): Promise<void> {
    await runSubprocessOrThrow("git", args, { cwd: root, env: GIT_IDENTITY_ENV })
  }

  async function createRepositoryWithMainWorktree(parent: string): Promise<{
    readonly root: string
    readonly mainWorktree: string
  }> {
    const root = join(parent, "repo")
    const mainWorktree = join(parent, "main-wt")
    mkdirSync(root, { recursive: true })
    await git(root, "init", "--quiet", "--initial-branch=main")
    writeFileSync(join(root, "README.md"), "readme\n")
    await git(root, "add", ".")
    await git(root, "commit", "--quiet", "-m", "base")
    await git(root, "switch", "--quiet", "-c", "work")
    await git(root, "worktree", "add", "--quiet", mainWorktree, "main")
    return { root, mainWorktree }
  }

  // 読むだけのテストと、ファイルを足してその場で戻すだけのテストが共有する。
  // git を書き換えるテストは共有せず、自分の一時ディレクトリに作る。
  let shared: { readonly root: string; readonly mainWorktree: string }
  let sharedParent: string
  beforeAll(async () => {
    sharedParent = mkdtempSync(join(tmpdir(), "tsukumo-main-worktree-shared-"))
    shared = await createRepositoryWithMainWorktree(sharedParent)
  })
  afterAll(() => {
    rmSync(sharedParent, { recursive: true, force: true })
  })

  describe("resolveMainWorktreePath", () => {
    test("main ブランチを出している作業ツリーのパスを返す", () => {
      expect(resolveMainWorktreePath(shared.root, "main")).toBe(realpathSync(shared.mainWorktree))
    })

    test("そのブランチを出している作業ツリーが無ければ例外を投げる", () => {
      expect(() => resolveMainWorktreePath(shared.root, "trunk")).toThrow()
    })
  })

  describe("syncSubmodules", () => {
    async function commitSubmodule(mainWorktree: string): Promise<string> {
      const upstream = join(tempDir(), "upstream")
      mkdirSync(upstream, { recursive: true })
      await git(upstream, "init", "--quiet", "--initial-branch=main")
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
      const { mainWorktree } = await createRepositoryWithMainWorktree(tempDir())
      await commitSubmodule(mainWorktree)
      const sub = join(mainWorktree, "sub")
      writeFileSync(join(sub, "a.txt"), "2\n")
      await git(sub, "commit", "--quiet", "-am", "second")
      await git(mainWorktree, "commit", "--quiet", "-am", "advance sub")
      await git(sub, "checkout", "--quiet", "HEAD~1")
      expect(isWorktreeClean(mainWorktree)).toBe(false)

      syncSubmodules(mainWorktree)

      expect(isWorktreeClean(mainWorktree)).toBe(true)
    })

    test(".gitmodules が無ければ何もしない", () => {
      const write = vi.spyOn(process.stderr, "write")
      syncSubmodules(shared.mainWorktree)
      expect(write).not.toHaveBeenCalled()
      expect(isWorktreeClean(shared.mainWorktree)).toBe(true)
      write.mockRestore()
    })

    test("揃えられなければ例外にせず、標準エラーに1行だけ書く", async () => {
      const { mainWorktree } = await createRepositoryWithMainWorktree(tempDir())
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
    test("何も変えていなければ true", () => {
      expect(isWorktreeClean(shared.mainWorktree)).toBe(true)
    })

    test("未コミットの変更があれば false", () => {
      const readme = join(shared.mainWorktree, "README.md")
      writeFileSync(readme, "changed\n")
      try {
        expect(isWorktreeClean(shared.mainWorktree)).toBe(false)
      } finally {
        writeFileSync(readme, "readme\n")
      }
    })

    test("未追跡のファイルがあれば false", () => {
      const untracked = join(shared.mainWorktree, "untracked.txt")
      writeFileSync(untracked, "x\n")
      try {
        expect(isWorktreeClean(shared.mainWorktree)).toBe(false)
      } finally {
        rmSync(untracked, { force: true })
      }
    })
  })
})
