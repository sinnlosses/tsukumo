// runtime・dev・hook の入口で、崩れた引数のとき何も読まずに止まることを見る
// （使い方は終了コード 2、拒否の集計だけ 1）。

import { resolve } from "node:path"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"

const ROOT = resolve(".")

describe("入口の引数", () => {
  test.each([
    ["stop.ts", "--port", "0"],
    ["stop.ts", "--port", "70000"],
    ["stop.ts", "--port"],
    ["stop.ts", "--foo"],
    ["stop.ts", "7398"],
    ["diagnostic.ts", "--from", "昨日"],
    ["diagnostic.ts", "--generation", "0"],
    ["diagnostic.ts", "--foo"],
    ["experience-metric.ts", "--days", "0"],
    ["experience-metric.ts", "--split", "2026/01/01"],
    ["experience-metric.ts", "--foo"],
    ["report-block-usage.ts", "--days", "-1"],
    ["report-block-usage.ts", "--days"],
    ["report-block-usage.ts", "--foo"],
    ["serve-revision.ts"],
    ["serve-revision.ts", "HEAD", "HEAD~1"],
    ["serve-revision.ts", "HEAD", "--port", "0"],
    ["serve-revision.ts", "HEAD", "--foo"],
  ])("%s %s は使い方を出して終了コード 2 で止まる", async (script, ...args) => {
    const result = await runSubprocess("node", [`scripts/runtime/${script}`, ...args], {
      cwd: ROOT,
    })
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("使い方")
  })

  test.each([["--foo"], ["--full", "--foo"], ["extra"]])(
    "dev/check.ts %s は使い方を出して終了コード 2 で止まる",
    async (...args) => {
      const result = await runSubprocess("node", ["scripts/dev/check.ts", ...args], { cwd: ROOT })
      expect(result.exitCode).toBe(2)
      expect(result.stdout).toBe("")
      expect(result.stderr).toContain("使い方")
    },
  )

  test.each([["--foo"], ["--days", "0"], ["--days", "abc"], ["--days"]])(
    "hook/hook-denial-tally.ts %s は終了コード 1 で止まる",
    async (...args) => {
      const result = await runSubprocess("node", ["scripts/hook/hook-denial-tally.ts", ...args], {
        cwd: ROOT,
      })
      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe("")
      expect(result.stderr).toBe("--days には正の整数を渡す\n")
    },
  )

  test.each([
    ["experience-metric.ts", "--days", "1", "--split", "2026-01-01"],
    ["report-block-usage.ts", "--days", "1"],
    ["diagnostic.ts", "--from", "2026-01-01", "--to", "2026-01-02", "--generation", "1"],
  ])("%s の正しい引数は使い方に落ちない", async (script, ...args) => {
    const result = await runSubprocess("node", [`scripts/runtime/${script}`, ...args], {
      cwd: ROOT,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
  })
})
