import { mkdirSync, realpathSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { readGitCommonDirectory } from "../../../scripts/shared/git-common-directory.ts"
import { runSubprocess } from "../../fixture/subprocess.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const tempDir = useTempDir("git-common-directory")

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await runSubprocess("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd,
  })
}

describe("git の共通ディレクトリ", () => {
  test("リポジトリの中から .git の絶対パスを返す", async () => {
    const repo = join(realpathSync(tempDir()), "repo")
    mkdirSync(repo)
    await git(repo, ["init", "--quiet"])

    expect(readGitCommonDirectory(repo)).toBe(join(repo, ".git"))
  })

  test("追加した作業ツリーの中からも本体の .git を返す", async () => {
    const repo = join(realpathSync(tempDir()), "repo")
    const linked = join(realpathSync(tempDir()), "linked")
    mkdirSync(repo)
    await git(repo, ["init", "--quiet"])
    await git(repo, ["commit", "--quiet", "--allow-empty", "-m", "first"])
    await git(repo, ["worktree", "add", "--quiet", "--detach", linked])

    expect(readGitCommonDirectory(linked)).toBe(join(repo, ".git"))
  })

  test("リポジトリの外では例外を投げる", () => {
    expect(() => readGitCommonDirectory(realpathSync(tempDir()))).toThrow("git rev-parse")
  })
})
