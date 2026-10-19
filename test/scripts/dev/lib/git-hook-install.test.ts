// 設置の冪等・非上書きと、別の作業ツリーでも同じ hook が走ることを、一時ディレクトリの git で確かめる。
// 実際の共有 .git/hooks は触らない。

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { installPreCommitHook } from "../../../../scripts/dev/lib/git-hook-install.ts"
import { runSubprocess } from "../../../fixture/subprocess.ts"

let root = ""
let main = ""
let linked = ""
let hooks = ""

async function git(cwd: string, args: readonly string[]) {
  return runSubprocess("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], {
    cwd,
  })
}

function writeEntry(worktree: string, exitCode: number): void {
  const path = join(worktree, "scripts/hook/pre-commit-token-limit.ts")
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `process.exit(${exitCode})\n`)
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "tsukumo-hook-install-"))
  main = join(root, "main")
  linked = join(root, "linked")
  hooks = join(main, ".git", "hooks")
  mkdirSync(main)
  await git(main, ["init", "-q"])
  writeFileSync(join(main, "seed.txt"), "seed\n")
  await git(main, ["add", "seed.txt"])
  await git(main, ["commit", "-q", "-m", "seed"])
  await git(main, ["worktree", "add", "-q", linked, "-b", "linked"])
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("pre-commit の設置", () => {
  test("1 回目は置き、2 回目は中身を変えない", () => {
    expect(installPreCommitHook(hooks)).toBe("installed")
    const first = readFileSync(join(hooks, "pre-commit"), "utf8")

    expect(installPreCommitHook(hooks)).toBe("unchanged")
    expect(readFileSync(join(hooks, "pre-commit"), "utf8")).toBe(first)
  })

  test("別の中身の pre-commit があれば上書きしない", () => {
    mkdirSync(hooks, { recursive: true })
    writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\necho mine\n")

    expect(installPreCommitHook(hooks)).toBe("foreign")
    expect(readFileSync(join(hooks, "pre-commit"), "utf8")).toBe("#!/bin/sh\necho mine\n")
  })
})

describe("置いた pre-commit", () => {
  test("どちらの作業ツリーのコミットも、その作業ツリーの入口が止める", async () => {
    installPreCommitHook(hooks)
    for (const worktree of [main, linked]) {
      writeEntry(worktree, 1)
      writeFileSync(join(worktree, `${worktree.split("/").at(-1)}.txt`), "x\n")
      await git(worktree, ["add", "."])

      const result = await git(worktree, ["commit", "-q", "-m", "x"])

      expect(result.exitCode, worktree).not.toBe(0)
    }
  })

  test("入口が通せば、コミットできる", async () => {
    installPreCommitHook(hooks)
    writeEntry(linked, 0)
    writeFileSync(join(linked, "ok.txt"), "x\n")
    await git(linked, ["add", "."])

    expect((await git(linked, ["commit", "-q", "-m", "ok"])).exitCode).toBe(0)
  })

  test("入口のファイルが無い作業ツリーでは通す", async () => {
    installPreCommitHook(hooks)
    writeFileSync(join(linked, "plain.txt"), "x\n")
    await git(linked, ["add", "."])

    expect((await git(linked, ["commit", "-q", "-m", "plain"])).exitCode).toBe(0)
  })
})
