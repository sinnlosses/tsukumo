import { describe, expect, it } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"

const ENTRY = new URL("../src/index.ts", import.meta.url).pathname

// 起動を待つ上限。ビューの URL が表示されるまでにかかる時間より十分に長くとる。
const STARTUP_TIMEOUT_MS = 10_000

// 実行中の $HOME。既定では毎回まっさらな一時ディレクトリを使い、開発機の実物の
// ~/.tsukumo を読みに行かないようにする（テストを環境から独立させるため）。
function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "tsukumo-test-"))
}

// 手で書いた架空の会話。壊れた行と未知の type を混ぜて、落ちずに読み飛ばすことを確かめる。
// assistant の発話は行頭マーカー（既定「アスナ: 」）で始まる行がセリフになる規約
// （docs/requirements.md 4.2）に従わせる。
const BROKEN_TRANSCRIPT_LINES = [
  '{"type":"user","message":{"content":[{"type":"text","text":"つくもさん、調子はどう？"}]}}',
  "{this line is not valid json",
  '{"type":"mode","value":"plan"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"アスナ: 絶好調だよ、任せて！"}]}}',
  '{"type":"unknown-future-type","payload":{"whatever":true}}',
].join("\n")

type RunOptions = {
  readonly homeDir?: string
  readonly viewPort?: string
  // サイドバーの develop/tasks.json は cwd 相対で読むため、無いことを確かめるテスト用に
  // 差し替えられるようにしておく（既定は実際の cwd を継承する）。
  readonly cwd?: string
  // キャラクター定義ディレクトリ。無いことを確かめるテスト用に差し替えられるようにしておく
  // （既定は cwd 相対の characters/tsukumo-spirit を継承する）。
  readonly characterDir?: string
  // レイアウトページのタブを自動で開くか。**既定は "0"（開かない）**にしてある。テストは
  // 1プロセスごとに異なる（空きポートの）URL で何度も起動するため、既定を "1" のままにすると
  // 実機の Orca が動いているときに毎回タブを増やしてしまう。
  readonly openView?: string
  // 指定すると、PATH の先頭に加える。`orca` が使えない状況を再現するテスト用
  // （fakeFailingOrcaDir 参照）。
  readonly pathPrepend?: string
  // セリフの行頭マーカー。**既定は実装の既定値と同じ文字列を明示的に渡す**（実行する人の
  // シェルに TSUKUMO_SPEECH_MARKER が設定されていてもテストの結果が変わらないようにするため）。
  readonly speechMarker?: string
}

function environmentFor(options: RunOptions): Record<string, string> {
  const homeDir = options.homeDir ?? makeTempDir()
  const inherited = Object.entries(process.env).flatMap(([key, value]) =>
    value === undefined ? [] : [[key, value] as const],
  )
  const inheritedEnv = Object.fromEntries(inherited)
  const path =
    options.pathPrepend === undefined
      ? inheritedEnv.PATH
      : `${options.pathPrepend}${delimiter}${inheritedEnv.PATH ?? ""}`

  return {
    ...inheritedEnv,
    ...(path === undefined ? {} : { PATH: path }),
    HOME: homeDir,
    // 常駐中のサイドカーとポートがぶつからないよう、既定では空きポートを使わせる。
    TSUKUMO_VIEW_PORT: options.viewPort ?? "0",
    TSUKUMO_OPEN_VIEW: options.openView ?? "0",
    TSUKUMO_SPEECH_MARKER: options.speechMarker ?? "アスナ: ",
    ...(options.characterDir === undefined ? {} : { TSUKUMO_CHARACTER_DIR: options.characterDir }),
  }
}

/**
 * `orca` を名乗って必ず失敗するだけの実行ファイルを置いたディレクトリを作る。
 * 実機に本物の `orca` があっても、PATH の先頭に置けば探索がこちらで止まるので、
 * 「`orca` が使えない」状況を実機の状態によらず再現できる。
 */
function fakeFailingOrcaDir(): string {
  const dir = makeTempDir()
  writeFileSync(join(dir, "orca"), "#!/bin/sh\nexit 1\n", { mode: 0o755 })
  return dir
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
  // ここまでに受け取った標準エラー出力（呼び出し時点のスナップショット）。
  readonly stderr: () => string
}

/** サイドカーを起動し、ビューの URL を表示するまで待つ。呼び出し側は必ず stop する。 */
function startCli(args: readonly string[], options: RunOptions = {}): Promise<RunningCli> {
  const child = spawn("bun", ["run", ENTRY, ...args], {
    env: environmentFor(options),
    cwd: options.cwd,
  })
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")

  let stderrText = ""
  child.stderr.on("data", (chunk: string) => {
    stderrText += chunk
  })

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
      resolve({ baseUrl: matched[0], stop, stderr: () => stderrText })
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

// transcript の追記をポーリングが検知するまでの待ち時間。src/index.ts の POLL_INTERVAL_MS
// （500ms）より十分長くとる。
const POLL_WAIT_MS = 1_500

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
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

  it("状態ファイルが既知のイベント種別・モデルを持つとき、対応する表情（alt）・衣装（差し色）を配る", async () => {
    const dir = makeTempDir()
    const homeDir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)
    writeTsukumoFile(homeDir, "state.json", JSON.stringify({ event: "PreToolUse", model: "opus" }))

    try {
      const page = await fetchView([transcriptPath], "character", { homeDir })

      // 表情は立ち絵の aria-label に、衣装は characters/tsukumo-spirit/character.json の
      // outfitAccents（opus = heavy = #ffb3a7）に現れる。
      expect(page).toContain("作業中")
      expect(page).toContain("--outfit-accent: #ffb3a7")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("メインビューが配られる（セリフだけの発話は詳細が空になるので、まだ作業がない扱いになる）", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)

    try {
      const page = await fetchView([transcriptPath], "main")

      expect(page).toContain("まだ作業がありません")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("TSUKUMO_SPEECH_MARKER でセリフの行頭マーカーを差し替えられる（キャラビューとメインビューの両方）", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(
      transcriptPath,
      '{"type":"assistant","message":{"content":[{"type":"text","text":"ゆき> 差し替えたマーカーのセリフ\\nアスナ: これはもう詳細"}]}}',
    )

    try {
      const characterPage = await fetchView([transcriptPath], "character", {
        speechMarker: "ゆき> ",
      })
      const mainPage = await fetchView([transcriptPath], "main", { speechMarker: "ゆき> " })

      expect(characterPage).toContain("差し替えたマーカーのセリフ")
      expect(characterPage).not.toContain("これはもう詳細")
      expect(mainPage).toContain("これはもう詳細")
      expect(mainPage).not.toContain("差し替えたマーカーのセリフ")
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

  it("既定のキャラクター（characters/tsukumo-spirit）の立ち絵がインライン SVG で、差し色付きで出る", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(
      transcriptPath,
      '{"type":"assistant","message":{"content":[{"type":"text","text":"アスナ: やあ"}]}}',
    )

    try {
      // characterDir を指定せず、cwd 相対の既定（characters/tsukumo-spirit）を使わせる。
      const page = await fetchView([transcriptPath], "character")

      expect(page).toContain('<div class="portrait"')
      expect(page).toContain("--outfit-accent")
      expect(page).toContain("<svg")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("キャラクター定義ディレクトリが存在しないときも、キャラビューは吹き出しだけで壊れずに配られる", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(
      transcriptPath,
      '{"type":"assistant","message":{"content":[{"type":"text","text":"アスナ: 立ち絵が無くても平気"}]}}',
    )

    try {
      const page = await fetchView([transcriptPath], "character", {
        characterDir: join(dir, "does-not-exist"),
      })

      expect(page).toContain("立ち絵が無くても平気")
      expect(page).not.toContain("<svg")
      expect(page).not.toContain("<img")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("character.json が壊れている（JSON として不正）ときも、キャラビューは吹き出しだけで壊れずに配られる", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    const characterDir = join(dir, "broken-character")
    mkdirSync(characterDir, { recursive: true })
    writeFileSync(join(characterDir, "character.json"), "{this is not valid json")
    writeFileSync(
      transcriptPath,
      '{"type":"assistant","message":{"content":[{"type":"text","text":"アスナ: それでも平気"}]}}',
    )

    try {
      const page = await fetchView([transcriptPath], "character", { characterDir })

      expect(page).toContain("それでも平気")
      expect(page).not.toContain("<svg")
      expect(page).not.toContain("<img")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("TSUKUMO_CHARACTER_DIR で利用者の素材（characters/local 相当）に差し替えられる。SVG はインラインで、差し色も効く", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    const characterDir = join(dir, "my-character")
    mkdirSync(characterDir, { recursive: true })
    writeFileSync(
      join(characterDir, "character.json"),
      JSON.stringify({
        name: "テスト用の子",
        portraits: { default: "default.svg" },
        outfitAccents: { default: "#123456" },
      }),
    )
    writeFileSync(
      join(characterDir, "default.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><circle fill="var(--outfit-accent, #fff)" r="1"/></svg>',
    )
    writeFileSync(
      transcriptPath,
      '{"type":"assistant","message":{"content":[{"type":"text","text":"アスナ: 自作の立ち絵だよ"}]}}',
    )

    try {
      const page = await fetchView([transcriptPath], "character", { characterDir })

      expect(page).toContain('<svg xmlns="http://www.w3.org/2000/svg">')
      expect(page).toContain('fill="var(--outfit-accent, #fff)"')
      expect(page).toContain("--outfit-accent: #123456")
      expect(page).toContain('aria-label="テスト用の子')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("ラスタ画像（SVG以外）の立ち絵は <img> の data URI で出る", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    const characterDir = join(dir, "raster-character")
    mkdirSync(characterDir, { recursive: true })
    writeFileSync(
      join(characterDir, "character.json"),
      JSON.stringify({ portraits: { default: "default.png" }, outfitAccents: {} }),
    )
    writeFileSync(join(characterDir, "default.png"), Buffer.from([1, 2, 3, 4]))
    writeFileSync(
      transcriptPath,
      '{"type":"assistant","message":{"content":[{"type":"text","text":"アスナ: ラスタでも平気"}]}}',
    )

    try {
      const page = await fetchView([transcriptPath], "character", { characterDir })

      expect(page).toContain('<img class="portrait-image" src="data:image/png;base64,')
      expect(page).not.toContain("<svg")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("規約に従っていない発話（セリフが無い）が来ても、吹き出しは直前のセリフを出し続ける", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(
      transcriptPath,
      '{"type":"assistant","message":{"content":[{"type":"text","text":"アスナ: 最初のセリフ"}]}}',
    )

    const cli = await startCli([transcriptPath])
    try {
      const firstPage = await fetch(`${cli.baseUrl}/character`).then((response) => response.text())
      expect(firstPage).toContain("最初のセリフ")

      // マーカーの無い（規約に従っていない）発話を追記する。
      appendFileSync(
        transcriptPath,
        '\n{"type":"assistant","message":{"content":[{"type":"text","text":"マーカーの無い発話の詳細だけ"}]}}',
      )
      await sleep(POLL_WAIT_MS)

      const secondPage = await fetch(`${cli.baseUrl}/character`).then((response) => response.text())
      expect(secondPage).toContain("最初のセリフ")
      expect(secondPage).not.toContain("マーカーの無い発話の詳細だけ")
    } finally {
      cli.stop()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("orca のタブを開けなくても、ビューの配信は続く", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)
    const fakeOrcaDir = fakeFailingOrcaDir()

    const cli = await startCli([transcriptPath], { openView: "1", pathPrepend: fakeOrcaDir })
    try {
      // showView は announce の後の非同期処理なので、失敗が stderr に出るまで少し待つ。
      await sleep(POLL_WAIT_MS)

      expect(cli.stderr()).toContain("ビューのタブを開けなかった")

      const response = await fetch(`${cli.baseUrl}/character`)
      expect(response.status).toBe(200)
    } finally {
      cli.stop()
      rmSync(dir, { recursive: true, force: true })
      rmSync(fakeOrcaDir, { recursive: true, force: true })
    }
  })

  it("TSUKUMO_OPEN_VIEW=0 のとき、タブを開こうとせず配信だけ続く", async () => {
    const dir = makeTempDir()
    const transcriptPath = join(dir, "session.jsonl")
    writeFileSync(transcriptPath, BROKEN_TRANSCRIPT_LINES)
    const fakeOrcaDir = fakeFailingOrcaDir()

    // openView を明示的に "0" にし、かつ orca も失敗する状況にしておく。
    // ここでタブを開こうとしていれば stderr にメッセージが出るはずなので、それが無いことで
    // 「開こうとしなかった」ことを確かめる。
    const cli = await startCli([transcriptPath], { openView: "0", pathPrepend: fakeOrcaDir })
    try {
      await sleep(POLL_WAIT_MS)

      expect(cli.stderr()).not.toContain("ビューのタブを開けなかった")

      const response = await fetch(`${cli.baseUrl}/character`)
      expect(response.status).toBe(200)
    } finally {
      cli.stop()
      rmSync(dir, { recursive: true, force: true })
      rmSync(fakeOrcaDir, { recursive: true, force: true })
    }
  })
})

function writeTsukumoFile(homeDir: string, name: string, content: string): void {
  const tsukumoDir = join(homeDir, ".tsukumo")
  mkdirSync(tsukumoDir, { recursive: true })
  writeFileSync(join(tsukumoDir, name), content)
}
