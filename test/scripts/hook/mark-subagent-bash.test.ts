// サブエージェントの Bash が走っている印を置き・消す hook を、一時の git リポジトリでスクリプトとして起こして確かめる。

import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import { beforeEach, describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const SUBAGENT_BASH_MARK_DIRECTORY = "subagent-bash"
const HOOK_PATH = resolve("scripts/hook/mark-subagent-bash.ts")
const TOOL_USE_ID = "toolu_fictional1"

const tempDir = useTempDir("mark-subagent-bash")
let repoDir = ""

beforeEach(async () => {
  repoDir = tempDir()
  await runSubprocess("git", ["init", "--quiet"], { cwd: repoDir })
})

type Call = {
  readonly event: string
  readonly agent: boolean
  readonly background: boolean
  readonly toolUseId: string
}

const SUBAGENT_CALL = {
  event: "PreToolUse",
  agent: true,
  background: false,
  toolUseId: TOOL_USE_ID,
} satisfies Call

function runHook(call: Call) {
  const input = JSON.stringify({
    hook_event_name: call.event,
    tool_name: "Bash",
    tool_use_id: call.toolUseId,
    tool_input: { command: "pnpm run check", run_in_background: call.background },
    cwd: repoDir,
    ...(call.agent ? { agent_id: "subagent-1" } : {}),
  })
  return runSubprocess(process.execPath, [HOOK_PATH], {
    cwd: repoDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoDir },
    input,
  })
}

function markExists(toolUseId = TOOL_USE_ID): boolean {
  return existsSync(join(repoDir, ".git", SUBAGENT_BASH_MARK_DIRECTORY, toolUseId))
}

describe("サブエージェントの Bash の印", () => {
  test("PreToolUse で印を置き、終了コード 0 で通す", async () => {
    const result = await runHook(SUBAGENT_CALL)
    expect(result.exitCode).toBe(0)
    expect(markExists()).toBe(true)
  })

  test.each(["PostToolUse", "PostToolUseFailure"])("%s で印を消す", async (event) => {
    await runHook(SUBAGENT_CALL)
    expect(markExists()).toBe(true)
    await runHook({ ...SUBAGENT_CALL, event })
    expect(markExists()).toBe(false)
  })

  test("背景に回した呼び出しは、PostToolUse が来ても印を残す", async () => {
    await runHook({ ...SUBAGENT_CALL, background: true })
    await runHook({ ...SUBAGENT_CALL, event: "PostToolUse", background: true })
    expect(markExists()).toBe(true)
  })

  test("主のセッションの呼び出しには印を置かない", async () => {
    const result = await runHook({ ...SUBAGENT_CALL, agent: false })
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(repoDir, ".git", SUBAGENT_BASH_MARK_DIRECTORY))).toBe(false)
  })

  test("ファイル名にできない tool_use_id には印を置かない", async () => {
    await runHook({ ...SUBAGENT_CALL, toolUseId: "../escape" })
    expect(existsSync(join(repoDir, ".git", SUBAGENT_BASH_MARK_DIRECTORY))).toBe(false)
    expect(existsSync(join(repoDir, ".git", "escape"))).toBe(false)
  })
})
