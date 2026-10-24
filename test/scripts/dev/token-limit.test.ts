// `--staged` が、cwd の git のステージだけを検査することを、入口を実際に起こして確かめる。
// pre-commit の入口はこれを呼ぶだけなので、止め方の細部は pre-commit の入口のテストが確かめる。
// `--staged` なしは入口が自分の作業ツリーを読むため、ここでは起こさない（`pnpm run token-limit` が毎回走らせる）。

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { beforeEach, describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const ENTRY = fileURLToPath(new URL("../../../scripts/dev/token-limit.ts", import.meta.url))

const tempDir = useTempDir("token-limit-staged")
let repoDir = ""

beforeEach(async () => {
  repoDir = tempDir()
  await runSubprocess("git", ["init", "--quiet"], { cwd: repoDir })
})

describe("--staged", () => {
  test("ステージした大きなファイルは止め、ステージしていないものは見ない", async () => {
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(join(repoDir, "unstaged.txt"), "a".repeat(20001))
    const unstaged = await runSubprocess(process.execPath, [ENTRY, "--staged"], { cwd: repoDir })
    expect(unstaged.exitCode).toBe(0)

    writeFileSync(join(repoDir, "big.txt"), "a".repeat(20001))
    await runSubprocess("git", ["add", "big.txt"], { cwd: repoDir })
    const staged = await runSubprocess(process.execPath, [ENTRY, "--staged"], { cwd: repoDir })
    expect(staged.exitCode).toBe(1)
    expect(staged.stderr).toContain("big.txt")
    expect(staged.stderr).not.toContain("unstaged.txt")
  })
})
