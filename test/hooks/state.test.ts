import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// hooks/state.sh は shell スクリプトなので bun:test の対象コードそのものではないが、
// 状態ファイルの原子的な差し替え・モデル名の引き継ぎはここでしか固定できない
// （docs/coding-standards.md「テスト」節「モックするのはシステム境界だけ」— ここでは
// ファイルシステムという境界越しに、実際のスクリプトを1プロセスとして動かして確かめる）。

const SCRIPT = new URL("../../hooks/state.sh", import.meta.url).pathname

function runHook(payload: string, homeDir: string) {
  return spawnSync("sh", [SCRIPT], {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir },
  })
}

/** hook は cwd ごとに別ファイルへ書く（`/` を `-` に置き換えた名前）。 */
function targetFilePath(homeDir: string, cwd: string): string {
  return join(homeDir, ".tsukumo", "targets", cwd.replaceAll("/", "-"))
}

function readTranscriptTarget(homeDir: string, cwd: string): unknown {
  return JSON.parse(readFileSync(targetFilePath(homeDir, cwd), "utf8"))
}

function readState(homeDir: string): unknown {
  return JSON.parse(readFileSync(join(homeDir, ".tsukumo", "state.json"), "utf8"))
}

// 手で書いた架空の payload。実物の hook payload・会話内容は使わない
// （docs/coding-standards.md「会話内容の扱い」）。

describe("hooks/state.sh", () => {
  it("SessionStart のとき、状態ファイルと transcript-path ファイルの両方を書く", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tsukumo-hook-"))
    const payload = JSON.stringify({
      hook_event_name: "SessionStart",
      session_id: "s1",
      transcript_path: "/tmp/fake-session/session.jsonl",
      cwd: "/tmp/fake-session",
      source: "startup",
      model: "opus",
    })

    try {
      const result = runHook(payload, homeDir)

      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe("{}")
      expect(readState(homeDir)).toEqual({ event: "SessionStart", model: "opus" })
      expect(readTranscriptTarget(homeDir, "/tmp/fake-session")).toEqual({
        transcriptPath: "/tmp/fake-session/session.jsonl",
        cwd: "/tmp/fake-session",
      })
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("SessionStart 以外は payload に model を持たないので、前回の値を引き継ぐ", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tsukumo-hook-"))

    try {
      runHook(
        JSON.stringify({
          hook_event_name: "SessionStart",
          session_id: "s1",
          transcript_path: "/tmp/fake-session/session.jsonl",
          cwd: "/tmp/fake-session",
          source: "startup",
          model: "sonnet",
        }),
        homeDir,
      )

      const result = runHook(
        JSON.stringify({
          hook_event_name: "PreToolUse",
          session_id: "s1",
          transcript_path: "/tmp/fake-session/session.jsonl",
          cwd: "/tmp/fake-session",
          tool_name: "Bash",
          tool_input: { command: 'echo "model": "not a real field"' },
          tool_use_id: "t1",
        }),
        homeDir,
      )

      expect(result.status).toBe(0)
      expect(readState(homeDir)).toEqual({ event: "PreToolUse", model: "sonnet" })
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("状態ファイルを書いたあと、一時ファイルを残さない", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tsukumo-hook-"))

    try {
      runHook(
        JSON.stringify({
          hook_event_name: "Stop",
          session_id: "s1",
          transcript_path: "/tmp/fake-session/session.jsonl",
          cwd: "/tmp/fake-session",
          stop_hook_active: false,
        }),
        homeDir,
      )

      const files = readdirSync(join(homeDir, ".tsukumo"))
      expect(files).toEqual(["state.json"])
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("payload が空のときは何も書かず、{} だけを返す", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tsukumo-hook-"))

    try {
      const result = runHook("", homeDir)

      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe("{}")
      expect(existsSync(join(homeDir, ".tsukumo"))).toBe(false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("登録していないイベント種別のときは、状態ファイルを書かずに終わる", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tsukumo-hook-"))

    try {
      const result = runHook(
        JSON.stringify({ hook_event_name: "SomeFutureEvent", session_id: "s1" }),
        homeDir,
      )

      expect(result.status).toBe(0)
      expect(existsSync(join(homeDir, ".tsukumo", "state.json"))).toBe(false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  // 会話の断片が状態ファイルへ漏れないことの釘。JSON の抽出は貪欲一致なので、
  // 本文に "hook_event_name" という文字列が含まれると、そちらを拾いうる
  // （docs/coding-standards.md「会話内容の扱い」）。
  it("プロンプト本文に hook_event_name らしき文字列が混ざっても、その断片を書かない", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tsukumo-hook-"))
    const prompt = 'hook の payload って {"hook_event_name":"ひみつの用事"} みたいな形なの?'

    try {
      const result = runHook(
        JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s1", prompt }),
        homeDir,
      )

      expect(result.status).toBe(0)
      const written = readFileSync(join(homeDir, ".tsukumo", "state.json"), "utf8")
      expect(written).not.toContain("ひみつの用事")
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("cwd が payload に無いときは、追従先を書かない", () => {
    // cwd が無いと「どのディレクトリのセッションか」が分からず、サイドカーは乗り換えの判断が
    // できない（src/transcript-target.ts）。中途半端なものを書くより書かないほうが安全。
    const homeDir = mkdtempSync(join(tmpdir(), "tsukumo-hook-"))

    try {
      const result = runHook(
        JSON.stringify({
          hook_event_name: "SessionStart",
          transcript_path: "/tmp/fake-session/session.jsonl",
        }),
        homeDir,
      )

      expect(result.status).toBe(0)
      expect(existsSync(join(homeDir, ".tsukumo", "targets"))).toBe(false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("パスに JSON を壊す文字（引用符・バックスラッシュ）が入っているときは書かない", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tsukumo-hook-"))

    try {
      const result = runHook(
        JSON.stringify({
          hook_event_name: "SessionStart",
          transcript_path: "/tmp/fake\\session.jsonl",
          cwd: "/tmp/fake",
        }),
        homeDir,
      )

      expect(result.status).toBe(0)
      expect(existsSync(join(homeDir, ".tsukumo", "targets"))).toBe(false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it("transcript_path が絶対パスでないときは書かない", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "tsukumo-hook-"))

    try {
      const result = runHook(
        JSON.stringify({ hook_event_name: "SessionStart", transcript_path: "relative.jsonl" }),
        homeDir,
      )

      expect(result.status).toBe(0)
      expect(existsSync(join(homeDir, ".tsukumo", "targets"))).toBe(false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })
})
