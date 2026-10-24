// 判定を 1 回の起動にまとめた入口の、束ね方（拒否の順・印を置くのは通すときだけ）を、スクリプトを起こして確かめる。
// 各判定の表は、判定ごとのテストが同じ入口で確かめる。

import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import { beforeEach, describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const HOOK_PATH = resolve("scripts/hook/bash-guard.ts")
const TOOL_USE_ID = "toolu_fictional2"

const tempDir = useTempDir("bash-guard")
let repoDir = ""

beforeEach(async () => {
  repoDir = tempDir()
  await runSubprocess("git", ["init", "--quiet"], { cwd: repoDir })
})

function runGuard(command: string, agent = false) {
  const input = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_use_id: TOOL_USE_ID,
    tool_input: { command },
    cwd: repoDir,
    ...(agent ? { agent_id: "subagent-1" } : {}),
  })
  return runSubprocess(process.execPath, [HOOK_PATH], {
    cwd: repoDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoDir, TSUKUMO_HOOK_DENIAL_RECORD: "off" },
    input,
  })
}

function markExists(): boolean {
  return existsSync(join(repoDir, ".git", "subagent-bash", TOOL_USE_ID))
}

describe("Bash の入口", () => {
  test("拒否が重なる入力では、先に並べた判定の文面で止める", async () => {
    const result = await runGuard("pkill -f x; cat")
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("複数の tsukumo が同時に動いている")
    expect(result.stderr).not.toContain("標準入力を待って")
  })

  test("後ろの判定だけが当たる入力は、その判定の文面で止める", async () => {
    const result = await runGuard("cat")
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("標準入力を待って")
  })

  test("通す呼び出しでは、サブエージェントの印を置く", async () => {
    expect((await runGuard("ls", true)).exitCode).toBe(0)
    expect(markExists()).toBe(true)
  })

  test("拒む呼び出しでは印を置かない", async () => {
    expect((await runGuard("cat", true)).exitCode).toBe(2)
    expect(markExists()).toBe(false)
  })
})
