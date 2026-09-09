import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ENTRY = new URL("../src/index.ts", import.meta.url).pathname

type RunOptions = {
  readonly timeout?: number
  // 実行中の $HOME。既定では毎回まっさらな一時ディレクトリを使い、開発機の実物の
  // ~/.tsukumo を読みに行かないようにする（テストを環境から独立させるため）。
  readonly homeDir?: string
}

function runCli(args: readonly string[], options: RunOptions = {}) {
  const homeDir = options.homeDir ?? mkdtempSync(join(tmpdir(), "tsukumo-home-"))
  return spawnSync("bun", ["run", ENTRY, ...args], {
    encoding: "utf8",
    timeout: options.timeout,
    killSignal: "SIGTERM",
    env: { ...process.env, HOME: homeDir },
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

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "tsukumo-test-"))
}

function writeTranscript(dir: string, content: string): string {
  const transcriptPath = join(dir, "session.jsonl")
  writeFileSync(transcriptPath, content)
  return transcriptPath
}

function writeHookTranscriptPath(homeDir: string, transcriptPath: string): void {
  const tsukumoDir = join(homeDir, ".tsukumo")
  mkdirSync(tsukumoDir, { recursive: true })
  writeFileSync(join(tsukumoDir, "transcript-path"), transcriptPath)
}

function writeStateFile(homeDir: string, content: string): void {
  const tsukumoDir = join(homeDir, ".tsukumo")
  mkdirSync(tsukumoDir, { recursive: true })
  writeFileSync(join(tsukumoDir, "state.json"), content)
}

describe("tsukumo CLI", () => {
  it("引数もhookが書いたtranscript-pathも無いとき、使い方を表示して終了コード2で終わる", () => {
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
    const dir = makeTempDir()
    const transcriptPath = writeTranscript(dir, BROKEN_TRANSCRIPT_LINES)

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

  it("引数を省略すると、hook が書いた transcript-path を追従先にする", () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const transcriptPath = writeTranscript(dir, BROKEN_TRANSCRIPT_LINES)
    writeHookTranscriptPath(homeDir, transcriptPath)

    try {
      const result = runCli([], { timeout: 1000, homeDir })

      expect(result.signal).toBe("SIGTERM")
      expect(result.stdout).toContain("絶好調だよ、任せて！")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("引数と hook の transcript-path が両方あるとき、引数を優先する", () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const argTranscript = writeTranscript(dir, BROKEN_TRANSCRIPT_LINES)
    const hookTranscriptDir = makeTempDir()
    const hookTranscript = writeTranscript(
      hookTranscriptDir,
      '{"type":"assistant","message":{"content":[{"type":"text","text":"hookの方の発話"}]}}',
    )
    writeHookTranscriptPath(homeDir, hookTranscript)

    try {
      const result = runCli([argTranscript], { timeout: 1000, homeDir })

      expect(result.signal).toBe("SIGTERM")
      expect(result.stdout).toContain("絶好調だよ、任せて！")
      expect(result.stdout).not.toContain("hookの方の発話")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(hookTranscriptDir, { recursive: true, force: true })
    }
  })

  it("状態ファイルがまだ書かれていないとき、既定の表情で描画し続ける", () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const transcriptPath = writeTranscript(dir, BROKEN_TRANSCRIPT_LINES)

    try {
      const result = runCli([transcriptPath], { timeout: 1000, homeDir })

      expect(result.signal).toBe("SIGTERM")
      expect(result.stdout).toContain("通常")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("状態ファイルが壊れている（JSONとして不正）とき、既定の表情で描画し続ける", () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const transcriptPath = writeTranscript(dir, BROKEN_TRANSCRIPT_LINES)
    writeStateFile(homeDir, "{this is not valid json")

    try {
      const result = runCli([transcriptPath], { timeout: 1000, homeDir })

      expect(result.signal).toBe("SIGTERM")
      expect(result.stdout).toContain("通常")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("状態ファイルのイベント種別が未知のとき、既定の表情で描画し続ける", () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const transcriptPath = writeTranscript(dir, BROKEN_TRANSCRIPT_LINES)
    writeStateFile(homeDir, JSON.stringify({ event: "SomeFutureEvent" }))

    try {
      const result = runCli([transcriptPath], { timeout: 1000, homeDir })

      expect(result.signal).toBe("SIGTERM")
      expect(result.stdout).toContain("通常")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("状態ファイルが既知のイベント種別・モデルを持つとき、対応する表情・衣装で描画する", () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const transcriptPath = writeTranscript(dir, BROKEN_TRANSCRIPT_LINES)
    writeStateFile(homeDir, JSON.stringify({ event: "PreToolUse", model: "opus" }))

    try {
      const result = runCli([transcriptPath], { timeout: 1000, homeDir })

      expect(result.signal).toBe("SIGTERM")
      expect(result.stdout).toContain("作業中")
      expect(result.stdout).toContain("戦闘配置")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })
})
