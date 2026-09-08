import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"

const ENTRY = new URL("../src/index.ts", import.meta.url).pathname

function runCli(args: readonly string[]) {
  return spawnSync("bun", ["run", ENTRY, ...args], { encoding: "utf8" })
}

describe("tsukumo CLI", () => {
  it("引数が無いとき、使い方を表示して終了コード2で終わる", () => {
    const result = runCli([])

    expect(result.status).toBe(2)
    expect(result.stderr).toContain("使い方:")
  })

  it("transcript を渡すと、未実装であることを伝えて終了コード1で終わる", () => {
    const result = runCli(["dummy.jsonl"])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("実装されていない")
  })
})
