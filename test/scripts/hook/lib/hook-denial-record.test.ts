// hook の拒否の記録と集計の契約を、スクリプトを実際に起こして確かめる。
// 記録は一時の git リポジトリの共有の git dir に置かれる。

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import { beforeEach, describe, expect, test } from "vitest"

import { runSubprocess } from "../../../fixture/subprocess.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const tempDir = useTempDir("hook-denial")
let repoDir = ""

beforeEach(async () => {
  repoDir = tempDir()
  await runSubprocess("git", ["init", "--quiet"], { cwd: repoDir })
})

describe("拒否の記録", () => {
  test.each([
    ["deny-broad-kill", "pkill-killall", { command: "pkill -f vitest" }],
    ["deny-sed-in-place", "sed-in-place", { command: "sed -i s/a/b/ notes.txt" }],
    [
      "deny-background-verify",
      "background-verify",
      { command: "tw verify", agent: true, background: true },
    ],
  ])("%s が拒むと、時刻・hook・規則のキー・actor だけの1行が増える", async (hook, rule, call) => {
    const result = await runBashHook(call)
    expect(result.exitCode).toBe(2)

    const [line, ...rest] = readDenialLines()
    expect(rest).toEqual([])
    expect(Object.keys(JSON.parse(line ?? "")).toSorted()).toEqual(["actor", "at", "hook", "rule"])
    expect(JSON.parse(line ?? "")).toMatchObject({
      hook,
      rule,
      actor: "agent" in call ? "subagent" : "main",
    })
  })

  test("拒まない呼び出しでは増えない", async () => {
    expect((await runBashHook({ command: "kill 123" })).exitCode).toBe(0)
    expect((await runBashHook({ command: "sed -n 1p notes.txt" })).exitCode).toBe(0)
    expect(readDenialLines()).toEqual([])
  })

  test("置き場に書けなくても、終了コードと stderr は書けるときと同じ", async () => {
    const call = { command: "pkill -f vitest" }
    const writable = await runBashHook(call)
    rmSync(join(repoDir, ".git", "hook-denials"), { recursive: true })
    writeFileSync(join(repoDir, ".git", "hook-denials"), "")
    const unwritable = await runBashHook(call)
    expect(unwritable.exitCode).toBe(writable.exitCode)
    expect(unwritable.stderr).toBe(writable.stderr)
  })
})

describe("log-only の hook", () => {
  test("拒まずに通し、log-only の行だけを記録に残す", async () => {
    const result = await runBashHook(
      { command: "pkill -f vitest" },
      { TSUKUMO_HOOK_LOG_ONLY: "deny-broad-kill" },
    )
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")

    const [line, ...rest] = readDenialLines()
    expect(rest).toEqual([])
    expect(JSON.parse(line ?? "")).toMatchObject({
      hook: "deny-broad-kill",
      rule: "pkill-killall",
      mode: "log-only",
    })
  })

  test("log-only でない hook は、同じ入力でも拒む", async () => {
    const result = await runBashHook(
      { command: "pkill -f vitest" },
      { TSUKUMO_HOOK_LOG_ONLY: "deny-sed-in-place" },
    )
    expect(result.exitCode).toBe(2)
  })

  test("再生で拒むはずだった形が一覧に出て、集計の拒否の回数には数えない", async () => {
    writeRegistration()
    const env = { TSUKUMO_HOOK_LOG_ONLY: "deny-broad-kill" }
    await runBashHook({ command: "pkill -f vitest" }, env)
    await runBashHook({ command: "killall node", agent: true }, env)

    const replay = await runHook(["scripts/hook/hook-denial-replay.ts"], "")
    expect(replay.exitCode).toBe(0)
    expect(replay.stdout).toContain("deny-broad-kill pkill-killall: 2（main 1 / subagent 1）")

    const tally = await runHook(["scripts/hook/hook-denial-tally.ts"], "")
    expect(tally.stdout).toContain("deny-broad-kill: 0")
  })

  test("log-only の記録が無ければ、無いと出す", async () => {
    const replay = await runHook(["scripts/hook/hook-denial-replay.ts"], "")
    expect(replay.stdout).toContain("拒むはずだった形はない")
  })
})

describe("集計", () => {
  test("登録された hook を、0件のものも含めて全部並べる", async () => {
    writeRegistration()
    await runBashHook({ command: "pkill -f vitest" })

    const result = await runHook(["scripts/hook/hook-denial-tally.ts"], "")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("deny-broad-kill: 1\n  pkill-killall: 1")
    expect(result.stdout).toContain("deny-sed-in-place: 0")
    expect(result.stdout).toContain("deny-background-verify: 0")
    expect(result.stdout).toContain("deny-stdin-wait-cat: 0")
    expect(result.stdout).not.toContain("（未登録）")
  })

  test("単独の deny-* の入口で登録されていても、その名前を並べる", async () => {
    writeRegistration(['node "$CLAUDE_PROJECT_DIR/scripts/hook/deny-broad-kill.ts"'])

    const result = await runHook(["scripts/hook/hook-denial-tally.ts"], "")
    expect(result.stdout).toContain("deny-broad-kill: 0")
    expect(result.stdout).not.toContain("deny-sed-in-place")
  })

  test("hook ではなく E2E の入口が拒んだ記録も、未登録とせずに数える", async () => {
    writeRegistration()
    const directory = join(repoDir, ".git", "hook-denials")
    mkdirSync(directory)
    const at = Temporal.Now.instant().toString()
    writeFileSync(
      join(directory, `${at.slice(0, 7)}.jsonl`),
      `${JSON.stringify({ at, hook: "e2e-run-limit", rule: "run-limit", actor: "subagent" })}\n`,
    )
    const result = await runHook(["scripts/hook/hook-denial-tally.ts"], "")
    expect(result.stdout).toContain("e2e-run-limit: 1\n  run-limit: 1")
    expect(result.stdout).not.toContain("（未登録）")
  })

  test("規則のキーごとに main / subagent / 不明の件数を出し、actor の欄が無い旧い行は不明に数える", async () => {
    writeRegistration()
    const directory = join(repoDir, ".git", "hook-denials")
    mkdirSync(directory)
    const at = Temporal.Now.instant().toString()
    const lines = [
      { at, hook: "deny-broad-kill", rule: "pkill-killall", actor: "main" },
      { at, hook: "deny-broad-kill", rule: "pkill-killall", actor: "subagent" },
      { at, hook: "deny-broad-kill", rule: "pkill-killall", actor: "subagent" },
      { at, hook: "deny-broad-kill", rule: "pkill-killall" },
    ]
    writeFileSync(
      join(directory, `${at.slice(0, 7)}.jsonl`),
      lines.map((line) => `${JSON.stringify(line)}\n`).join(""),
    )
    const result = await runHook(["scripts/hook/hook-denial-tally.ts"], "")
    expect(result.stdout).toContain(
      "deny-broad-kill: 4\n  pkill-killall: 4（main 1 / subagent 2 / 不明 1）",
    )
  })

  test("登録に無い hook の名前（tw の関門）も、未登録と付けて内訳つきで出す", async () => {
    writeRegistration()
    const directory = join(repoDir, ".git", "hook-denials")
    mkdirSync(directory)
    const at = Temporal.Now.instant().toString()
    writeFileSync(
      join(directory, `${at.slice(0, 7)}.jsonl`),
      `${JSON.stringify({ at, hook: "tw-commit-guard", rule: "shell-write", actor: "subagent" })}\n`,
    )
    const result = await runHook(["scripts/hook/hook-denial-tally.ts"], "")
    expect(result.stdout).toContain(
      "tw-commit-guard（未登録）: 1\n  shell-write: 1（main 0 / subagent 1 / 不明 0）",
    )
  })

  test("記録が無ければ全部0で出す", async () => {
    writeRegistration()
    const result = await runHook(["scripts/hook/hook-denial-tally.ts"], "")
    expect(result.stdout).toContain("deny-broad-kill: 0")
    expect(result.stdout).toContain("deny-sed-in-place: 0")
    expect(result.stdout).toContain("e2e-run-limit: 0")
  })

  test("期間の外の記録は数えない", async () => {
    writeRegistration()
    const directory = join(repoDir, ".git", "hook-denials")
    mkdirSync(directory)
    writeFileSync(
      join(directory, "2020-01.jsonl"),
      `${JSON.stringify({ at: "2020-01-01T00:00:00Z", hook: "deny-broad-kill", rule: "pkill-killall", actor: "main" })}\n`,
    )
    const result = await runHook(["scripts/hook/hook-denial-tally.ts", "--days", "7"], "")
    expect(result.stdout).toContain("deny-broad-kill: 0")
  })
})

const BASH_GUARD_COMMAND = 'node "$CLAUDE_PROJECT_DIR/scripts/hook/bash-guard.ts"'

function writeRegistration(commands: readonly string[] = [BASH_GUARD_COMMAND]): void {
  mkdirSync(join(repoDir, ".claude"))
  writeFileSync(
    join(repoDir, ".claude", "settings.json"),
    JSON.stringify({
      hooks: { PreToolUse: [{ hooks: commands.map((command) => ({ command })) }] },
    }),
  )
}

type Call = {
  readonly command: string
  readonly agent?: boolean
  readonly background?: boolean
}

function runBashHook(call: Call, extraEnv: Record<string, string> = {}) {
  const input = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: call.command, run_in_background: call.background === true },
    cwd: repoDir,
    ...(call.agent === true ? { agent_id: "subagent-1" } : {}),
  })
  return runHook(["scripts/hook/bash-guard.ts"], input, extraEnv)
}

function runHook(args: readonly string[], input: string, extraEnv: Record<string, string> = {}) {
  const [script = "", ...rest] = args
  return runSubprocess(process.execPath, [resolve(script), ...rest], {
    cwd: repoDir,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: repoDir,
      TSUKUMO_HOOK_DENIAL_RECORD: "on",
      ...extraEnv,
    },
    input,
  })
}

function readDenialLines(): readonly string[] {
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
