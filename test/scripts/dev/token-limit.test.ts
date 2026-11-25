// `--staged` が、cwd の git のステージだけを検査することを、入口を実際に起こして確かめる。
// pre-commit の入口はこれを呼ぶだけなので、警告の細部は pre-commit の入口のテストが確かめる。
// `--staged` なしは自分の作業ツリーを測ってドラフトを積むため、ここでは起こさない（`pnpm run token-limit` が毎回走らせる）。

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
  test("ステージした大きなファイルは止めずに警告し、ステージしていないものは見ない", async () => {
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(join(repoDir, "unstaged.txt"), "a".repeat(24001))
    const unstaged = await runSubprocess(process.execPath, [ENTRY, "--staged"], { cwd: repoDir })
    expect(unstaged.exitCode).toBe(0)
    expect(unstaged.stderr).toBe("")

    writeFileSync(join(repoDir, "big.txt"), "a".repeat(24001))
    await runSubprocess("git", ["add", "big.txt"], { cwd: repoDir })
    const staged = await runSubprocess(process.execPath, [ENTRY, "--staged"], { cwd: repoDir })
    expect(staged.exitCode).toBe(0)
    expect(staged.stderr).toContain("big.txt")
    expect(staged.stderr).not.toContain("unstaged.txt")
  })
})
