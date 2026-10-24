// dev の入口で、崩れた引数のとき何も読まずに止まることを見る（使い方は終了コード 2）。
// 起こす子プロセスの数を抑えるため、ここで起こすのは dev の入口の代表（check・e2e-update）の2本だけ。
// 引数の読み取りの部品（`--days` など）は、その部品の単体テストで見る。

import { resolve } from "node:path"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"

const ROOT = resolve(".")

describe("入口の引数", () => {
  test.each([
    ["check.ts", "--foo"],
    ["e2e-update.ts", "--foo"],
  ])("dev/%s %s は使い方を出して終了コード 2 で止まる", async (script, ...args) => {
    const result = await runSubprocess("node", [`scripts/dev/${script}`, ...args], { cwd: ROOT })
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("使い方")
  })
})
