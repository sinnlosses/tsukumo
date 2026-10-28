// 入口を実際に起こして、残りの出力の形と、除外・実在しないパスを出さないことを確かめる。

import { statSync } from "node:fs"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"

const ENTRY = fileURLToPath(new URL("../../../scripts/dev/token-budget.ts", import.meta.url))
const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("token-budget", () => {
  test("検査の対象のファイルは、残りと上限を 1 行で出す", async () => {
    const path = "scripts/dev/token-budget.ts"
    const tokens = Math.ceil(statSync(`${ROOT}${path}`).size / 4)

    const result = await runSubprocess(process.execPath, [ENTRY, path])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(`${path}\t${5000 - tokens}\t5000\n`)
  })

  test("除外のパスと実在しないパスは出さず、終了コードは 0", async () => {
    const result = await runSubprocess(process.execPath, [
      ENTRY,
      "pnpm-lock.yaml",
      "no/such/file.ts",
      "scripts",
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
  })
})
