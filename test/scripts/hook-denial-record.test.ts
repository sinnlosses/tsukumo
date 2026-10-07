// hook の拒否の記録と集計の契約を、スクリプトを実際に起こして確かめる。
// 記録は一時の git リポジトリの共有の git dir に置かれる。

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import { beforeEach, describe, expect, test } from "vitest"

import { RUN_LIMIT } from "../../scripts/lib/e2e-run-limit.ts"
import { runSubprocess } from "../fixture/subprocess.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

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
    const result = await runBashHook(hook, call)
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

  test("E2E の上限を超えた呼び出しの拒否を記録する", async () => {
    mkdirSync(join(repoDir, ".git", "task-open-claims"))
    writeFileSync(join(repoDir, ".git", "task-open-claims", "TASK-A"), "")
    for (let count = 0; count <= RUN_LIMIT; count++) {
      await runBashHook("deny-e2e-run-limit", { command: "tw verify --full", agent: true })
    }
    expect(readDenialLines().map((line) => JSON.parse(line))).toMatchObject([
      { hook: "deny-e2e-run-limit", rule: "run-limit", actor: "subagent" },
    ])
  })

  test("拒まない呼び出しでは増えない", async () => {
    expect((await runBashHook("deny-broad-kill", { command: "kill 123" })).exitCode).toBe(0)
    expect(
      (await runBashHook("deny-sed-in-place", { command: "sed -n 1p notes.txt" })).exitCode,
    ).toBe(0)
    expect(readDenialLines()).toEqual([])
  })

  test("置き場に書けなくても、終了コードと stderr は書けるときと同じ", async () => {
    const call = { command: "pkill -f vitest" }
    const writable = await runBashHook("deny-broad-kill", call)
    rmSync(join(repoDir, ".git", "hook-denials"), { recursive: true })
    writeFileSync(join(repoDir, ".git", "hook-denials"), "")
    const unwritable = await runBashHook("deny-broad-kill", call)
    expect(unwritable.exitCode).toBe(writable.exitCode)
    expect(unwritable.stderr).toBe(writable.stderr)
  })
})

describe("集計", () => {
  test("登録された hook を、0件のものも含めて全部並べる", async () => {
    writeRegistration()
    await runBashHook("deny-broad-kill", { command: "pkill -f vitest" })

    const result = await runHook(["scripts/hook-denial-tally.ts"], "")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("deny-broad-kill: 1\n  pkill-killall: 1")
    expect(result.stdout).toContain("deny-sed-in-place: 0")
  })

  test("記録が無ければ全部0で出す", async () => {
    writeRegistration()
    const result = await runHook(["scripts/hook-denial-tally.ts"], "")
    expect(result.stdout).toContain("deny-broad-kill: 0")
    expect(result.stdout).toContain("deny-sed-in-place: 0")
  })

  test("期間の外の記録は数えない", async () => {
    writeRegistration()
    const directory = join(repoDir, ".git", "hook-denials")
    mkdirSync(directory)
    writeFileSync(
      join(directory, "2020-01.jsonl"),
      `${JSON.stringify({ at: "2020-01-01T00:00:00Z", hook: "deny-broad-kill", rule: "pkill-killall", actor: "main" })}\n`,
    )
    const result = await runHook(["scripts/hook-denial-tally.ts", "--days", "7"], "")
    expect(result.stdout).toContain("deny-broad-kill: 0")
  })
})

function writeRegistration(): void {
  mkdirSync(join(repoDir, ".claude"))
  writeFileSync(
    join(repoDir, ".claude", "settings.json"),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              { command: 'node "$CLAUDE_PROJECT_DIR/scripts/deny-broad-kill.ts"' },
              { command: 'node "$CLAUDE_PROJECT_DIR/scripts/deny-sed-in-place.ts"' },
            ],
          },
        ],
      },
    }),
  )
}

type Call = {
  readonly command: string
  readonly agent?: boolean
  readonly background?: boolean
}

function runBashHook(hook: string, call: Call) {
  const input = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: call.command, run_in_background: call.background === true },
    cwd: repoDir,
    ...(call.agent === true ? { agent_id: "subagent-1" } : {}),
  })
  return runHook([`scripts/${hook}.ts`], input)
}

function runHook(args: readonly string[], input: string) {
  const [script = "", ...rest] = args
  return runSubprocess(process.execPath, [resolve(script), ...rest], {
    cwd: repoDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoDir, TSUKUMO_HOOK_DENIAL_RECORD: "on" },
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
