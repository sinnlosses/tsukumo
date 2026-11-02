// Bash の結果の行数を数える PostToolUse hook の契約を、スクリプトを実際に起こして確かめる。
// 記録は一時の git リポジトリの共有の git dir に置かれる。

import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import { beforeEach, describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const tempDir = useTempDir("truncate-bash-output")
let repoDir = ""

beforeEach(async () => {
  repoDir = tempDir()
  await runSubprocess("git", ["init", "--quiet"], { cwd: repoDir })
})

function linesOf(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index}`).join("\n")
}

describe("Bash の結果の行数を数える hook", () => {
  test("既定の行数を超えた結果を、切らずに log-only の行で記録する", async () => {
    const result = await runOutputHook({ command: "ls -R", stdout: linesOf(230), agent: true })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe("")

    const [line, ...rest] = readRecordLines()
    expect(rest).toEqual([])
    expect(Object.keys(JSON.parse(line ?? "")).toSorted()).toEqual([
      "actor",
      "at",
      "cutLines",
      "hook",
      "mode",
      "rule",
    ])
    expect(JSON.parse(line ?? "")).toMatchObject({
      hook: "truncate-bash-output",
      rule: "wrappable",
      actor: "subagent",
      mode: "log-only",
      cutLines: 30,
    })
  })

  test("stdout と stderr を合わせて数える", async () => {
    await runOutputHook({ command: "make", stdout: linesOf(150), stderr: linesOf(60) })
    expect(JSON.parse(readRecordLines()[0] ?? "")).toMatchObject({ cutLines: 10, actor: "main" })
  })

  test("既定の行数に収まる結果は記録しない", async () => {
    expect((await runOutputHook({ command: "ls", stdout: linesOf(200) })).exitCode).toBe(0)
    expect(readRecordLines()).toEqual([])
  })

  test("形が違う入力では何もしない", async () => {
    expect((await runHook(["scripts/hook/truncate-bash-output.ts"], "{not json")).exitCode).toBe(0)
    expect(readRecordLines()).toEqual([])
  })

  test("再生で、規則のキーごとに切るはずだった行数の合計が出る", async () => {
    await runOutputHook({ command: "ls -R", stdout: linesOf(230) })
    await runOutputHook({ command: "git log", stdout: linesOf(210) })

    const replay = await runHook(["scripts/hook/hook-denial-replay.ts"], "")
    expect(replay.stdout).toMatch(
      /^truncate-bash-output wrappable: 2（main 2）.*切るはずだった行 40$/m,
    )
  })
})

type OutputCall = {
  readonly command: string
  readonly stdout: string
  readonly stderr?: string
  readonly agent?: boolean
}

function runOutputHook(call: OutputCall) {
  const input = JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: call.command },
    tool_response: { stdout: call.stdout, stderr: call.stderr ?? "", interrupted: false },
    cwd: repoDir,
    ...(call.agent === true ? { agent_id: "subagent-1" } : {}),
  })
  return runHook(["scripts/hook/truncate-bash-output.ts"], input)
}

function runHook(args: readonly string[], input: string) {
  const [script = "", ...rest] = args
  return runSubprocess(process.execPath, [resolve(script), ...rest], {
    cwd: repoDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoDir, TSUKUMO_HOOK_DENIAL_RECORD: "on" },
    input,
  })
}

function readRecordLines(): readonly string[] {
  const directory = join(repoDir, ".git", "hook-denials")
  try {
    return readdirSync(directory).flatMap((name) =>
      readFileSync(join(directory, name), "utf8")
        .split("\n")
        .filter((line) => line !== ""),
    )
  } catch {
    return []
  }
}
