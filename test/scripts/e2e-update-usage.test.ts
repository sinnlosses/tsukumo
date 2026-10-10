// 撮り直しの入口を起こし、使い方を出して止まる場合（E2E を走らせない場合）の終了コードと出力を見る。

import { resolve } from "node:path"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"

const ROOT = resolve(".")
const SCRIPT = "scripts/e2e-update.ts"

describe("撮り直しの入口の使い方の出し方", () => {
  test.each([
    ["--help", ["--help"]],
    ["-h", ["-h"]],
    ["知らないフラグ", ["--foo"]],
  ])("%s は使い方を標準エラーに出して終了コード 2 で止まり、標準出力は空", async (_name, args) => {
    const result = await runSubprocess("node", [SCRIPT, ...args], { cwd: ROOT })
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("node scripts/e2e-update.ts --full")
  })
})
