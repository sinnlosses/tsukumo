import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ENTRY = new URL("../src/index.ts", import.meta.url).pathname

function runCli(args: readonly string[], options: { readonly timeout?: number } = {}) {
  return spawnSync("bun", ["run", ENTRY, ...args], {
    encoding: "utf8",
    timeout: options.timeout,
    killSignal: "SIGTERM",
  })
}

// 手で書いた架空の会話。壊れた行と未知の type を混ぜて、落ちずに読み飛ばすことを確かめる。
const BROKEN_TRANSCRIPT_LINES = [
  '{"type":"user","message":{"content":[{"type":"text","text":"つくもさん、調子はどう？"}]}}',
  "{this line is not valid json",
  '{"type":"mode","value":"plan"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"絶好調だよ、任せて！"}]}}',
  '{"type":"unknown-future-type","payload":{"whatever":true}}',
].join("\n")

describe("tsukumo CLI", () => {
  it("引数が無いとき、使い方を表示して終了コード2で終わる", () => {
    const result = runCli([])

    expect(result.status).toBe(2)
    expect(result.stderr).toContain("使い方:")
  })

  it("存在しない transcript を渡すと、読み込めないことを伝えて終了コード1で終わる", () => {
    const result = runCli(["does-not-exist.jsonl"])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("読み込めない")
  })

  it("壊れた行・未知の type を含む transcript でも、落ちずに吹き出しを描画し続ける", () => {
    const dir = mkdtempSync(join(tmpdir(), "tsukumo-test-"))
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)

    try {
      const result = runCli([transcriptPath], { timeout: 1000 })

      // タイムアウトで強制終了されている = 例外で落ちずにポーリングを続けたまま生きていた
      expect(result.signal).toBe("SIGTERM")
      expect(result.stdout).toContain("絶好調だよ、任せて！")
      expect(result.stdout).toContain("╭")
      expect(result.stdout).toContain("╰")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
