// WebFetch の入口が、サブエージェントの許可リストの外のホストを log-only で記録することを、スクリプトを起こして確かめる。
// 記録は一時の git リポジトリの共有の git dir に置かれる。

import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import { beforeEach, describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const HOOK_PATH = resolve("scripts/hook/deny-web-fetch-host.ts")
const OUTSIDE_URL = "https://example.test/fictional-path"

const tempDir = useTempDir("deny-web-fetch-host")
let repoDir = ""

beforeEach(async () => {
  repoDir = tempDir()
  await runSubprocess("git", ["init", "--quiet"], { cwd: repoDir })
})

describe("WebFetch の入口", () => {
  test("サブエージェントの許可リストの外のホストは、止めずに URL もホスト名も無い1行を記録する", async () => {
    const result = await runHook(webFetchInput(OUTSIDE_URL, { subagent: true }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe("")

    const [line, ...rest] = readDenialLines()
    expect(rest).toEqual([])
    expect(line).not.toContain("example.test")
    expect(line).not.toContain("fictional-path")
    expect(Object.keys(JSON.parse(line ?? "")).toSorted()).toEqual([
      "actor",
      "at",
      "hook",
      "mode",
      "rule",
    ])
    expect(JSON.parse(line ?? "")).toMatchObject({
      hook: "deny-web-fetch-host",
      rule: "host-outside-allowlist",
      actor: "subagent",
      mode: "log-only",
    })
  })

  test.each([
    ["主のセッションの許可リストの外のホスト", webFetchInput(OUTSIDE_URL, { subagent: false })],
    [
      "サブエージェントの許可リストのホスト",
      webFetchInput("https://github.com/o/r", { subagent: true }),
    ],
    ["壊れた JSON", "{not json"],
  ])("%s は止めずに記録しない", async (_name, input) => {
    const result = await runHook(input)
    expect(result.exitCode).toBe(0)
    expect(readDenialLines()).toEqual([])
  })
})

function webFetchInput(url: string, call: { readonly subagent: boolean }): string {
  return JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "WebFetch",
    tool_input: { url, prompt: "p" },
    cwd: repoDir,
    ...(call.subagent ? { agent_id: "subagent-1" } : {}),
  })
}

function runHook(input: string) {
  return runSubprocess(process.execPath, [HOOK_PATH], {
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
