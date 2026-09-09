import { describe, expect, it } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ENTRY = new URL("../src/index.ts", import.meta.url).pathname

// 起動を待つ上限。ビューの URL が表示されるまでにかかる時間より十分に長くとる。
const STARTUP_TIMEOUT_MS = 10_000

// 実行中の $HOME。既定では毎回まっさらな一時ディレクトリを使い、開発機の実物の
// ~/.tsukumo を読みに行かないようにする（テストを環境から独立させるため）。
function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "tsukumo-test-"))
}

// 手で書いた架空の会話。壊れた行と未知の type を混ぜて、落ちずに読み飛ばすことを確かめる。
const BROKEN_TRANSCRIPT_LINES = [
  '{"type":"user","message":{"content":[{"type":"text","text":"つくもさん、調子はどう？"}]}}',
  "{this line is not valid json",
  '{"type":"mode","value":"plan"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"絶好調だよ、任せて！"}]}}',
  '{"type":"unknown-future-type","payload":{"whatever":true}}',
].join("\n")

type RunOptions = {
  readonly homeDir?: string
  readonly viewPort?: string
  // サイドバーの develop/tasks.json は cwd 相対で読むため、無いことを確かめるテスト用に
  // 差し替えられるようにしておく（既定は実際の cwd を継承する）。
  readonly cwd?: string
}

function environmentFor(options: RunOptions): Record<string, string> {
  const homeDir = options.homeDir ?? makeTempDir()
  const inherited = Object.entries(process.env).flatMap(([key, value]) =>
    value === undefined ? [] : [[key, value] as const],
  )

  return {
    ...Object.fromEntries(inherited),
    HOME: homeDir,
    // 常駐中のサイドカーとポートがぶつからないよう、既定では空きポートを使わせる。
    TSUKUMO_VIEW_PORT: options.viewPort ?? "0",
  }
}

function runCliToExit(args: readonly string[], options: RunOptions = {}) {
  return spawnSync("bun", ["run", ENTRY, ...args], {
    encoding: "utf8",
    env: environmentFor(options),
    cwd: options.cwd,
  })
}

type RunningCli = {
  readonly baseUrl: string
  readonly stop: () => void
}

/** サイドカーを起動し、ビューの URL を表示するまで待つ。呼び出し側は必ず stop する。 */
function startCli(args: readonly string[], options: RunOptions = {}): Promise<RunningCli> {
  const child = spawn("bun", ["run", ENTRY, ...args], {
    env: environmentFor(options),
    cwd: options.cwd,
  })
  child.stdout.setEncoding("utf8")

  return new Promise((resolve, reject) => {
    const stop = () => {
      child.kill("SIGTERM")
    }
    const giveUp = setTimeout(() => {
      stop()
      reject(new Error("ビューの URL が表示されないまま時間切れになった"))
    }, STARTUP_TIMEOUT_MS)

    let printed = ""
    child.stdout.on("data", (chunk: string) => {
      printed += chunk
      const matched = /http:\/\/127\.0\.0\.1:\d+/.exec(printed)
      if (matched === null) {
        return
      }

      clearTimeout(giveUp)
      resolve({ baseUrl: matched[0], stop })
    })
  })
}

/** 起動したサイドカーからビューの本文を1回取り出す。 */
async function fetchView(args: readonly string[], view: string, options: RunOptions = {}) {
  const cli = await startCli(args, options)
  try {
    const response = await fetch(`${cli.baseUrl}/${view}`)
    return await response.text()
  } finally {
    cli.stop()
  }
}

describe("tsukumo CLI", () => {
  it("引数もhookが書いたtranscript-pathも無いとき、使い方を表示して終了コード2で終わる", () => {
    const result = runCliToExit([])

    expect(result.status).toBe(2)
    expect(result.stderr).toContain("使い方:")
  })

  it("存在しない transcript を渡すと、読み込めないことを伝えて終了コード1で終わる", () => {
    const result = runCliToExit(["does-not-exist.jsonl"])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("読み込めない")
  })

  it("ポート番号として読めない設定のとき、理由を伝えて終了コード1で終わる", () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)

    try {
      const result = runCliToExit([transcriptPath], { viewPort: "ぜんぶ" })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain("TSUKUMO_VIEW_PORT")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("壊れた行・未知の type を含む transcript でも、落ちずにキャラビューを配る", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)

    try {
      const page = await fetchView([transcriptPath], "character")

      expect(page).toContain("絶好調だよ、任せて！")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("引数を省略すると、hook が書いた transcript-path を追従先にする", async () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)
    writeTsukumoFile(homeDir, "transcript-path", transcriptPath)

    try {
      const page = await fetchView([], "character", { homeDir })

      expect(page).toContain("絶好調だよ、任せて！")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("引数と hook の transcript-path が両方あるとき、引数を優先する", async () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const hookDir = makeTempDir()
    const argTranscript = join(dir, "session.jsonl")
    const hookTranscript = join(hookDir, "session.jsonl")
    writeFileSync(argTranscript, BROKEN_TRANSCRIPT_LINES)
    writeFileSync(
      hookTranscript,
      '{"type":"assistant","message":{"content":[{"type":"text","text":"hookの方の発話"}]}}',
    )
    writeTsukumoFile(homeDir, "transcript-path", hookTranscript)

    try {
      const page = await fetchView([argTranscript], "character", { homeDir })

      expect(page).toContain("絶好調だよ、任せて！")
      expect(page).not.toContain("hookの方の発話")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(hookDir, { recursive: true, force: true })
    }
  })

  it("状態ファイルが壊れている（JSONとして不正）とき、既定の表情で配り続ける", async () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)
    writeTsukumoFile(homeDir, "state.json", "{this is not valid json")

    try {
      const page = await fetchView([transcriptPath], "character", { homeDir })

      expect(page).toContain("通常")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("状態ファイルが既知のイベント種別・モデルを持つとき、対応する表情・衣装を配る", async () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)
    writeTsukumoFile(homeDir, "state.json", JSON.stringify({ event: "PreToolUse", model: "opus" }))

    try {
      const page = await fetchView([transcriptPath], "character", { homeDir })

      expect(page).toContain("作業中")
      expect(page).toContain("戦闘配置")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("中身が未定のビューも、経路としては配られている", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)

    try {
      const page = await fetchView([transcriptPath], "main")

      expect(page).toContain("準備中")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("サイドバーに3つの区画が配られる", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)

    try {
      const page = await fetchView([transcriptPath], "sidebar")

      expect(page).toContain("コンテキスト使用量")
      expect(page).toContain("サブエージェント")
      expect(page).toContain("タスクの進捗")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("usage・pendingBackgroundAgentCount・サブエージェント・develop/tasks.json がどれも無くても、サイドバーは壊れずに配られる", async () => {
    const dir = makeTempDir()
    const cwdDir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    // BROKEN_TRANSCRIPT_LINES には usage も pendingBackgroundAgentCount も無く、
    // session.jsonl 用の subagents ディレクトリも作らない。cwd も develop/tasks.json が無い
    // まっさらな一時ディレクトリにする。
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)

    try {
      const page = await fetchView([transcriptPath], "sidebar", { cwd: cwdDir })

      expect(page).toContain("不明")
      expect(page).toContain("直近の活動なし")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(cwdDir, { recursive: true, force: true })
    }
  })

  it("サブエージェントは meta.json があればラベル付きで、無ければツール名だけで区別して出る", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)

    // session.jsonl の隣の同名ディレクトリに subagents/ を置く（実測どおりの配置）。
    const subagentsDir = join(dir, "session", "subagents")
    mkdirSync(subagentsDir, { recursive: true })
    writeFileSync(
      join(subagentsDir, "agent-a0001.jsonl"),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash", input: { command: "echo hi" } }] },
      }),
    )
    writeFileSync(
      join(subagentsDir, "agent-a0001.meta.json"),
      JSON.stringify({ agentType: "general-purpose", description: "架空のタスクA", model: "opus" }),
    )
    // agent-b0002 には meta.json を置かない（古いサブエージェント等を想定）。
    writeFileSync(
      join(subagentsDir, "agent-b0002.jsonl"),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/a" } }] },
      }),
    )

    try {
      const page = await fetchView([transcriptPath], "sidebar")

      expect(page).toContain("架空のタスクA (opus) — Bash")
      expect(page).toContain("<li>Read</li>")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function writeTsukumoFile(homeDir: string, name: string, content: string): void {
  const tsukumoDir = join(homeDir, ".tsukumo")
  mkdirSync(tsukumoDir, { recursive: true })
  writeFileSync(join(tsukumoDir, name), content)
}
