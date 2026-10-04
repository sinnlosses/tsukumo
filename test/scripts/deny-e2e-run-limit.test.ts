// 委譲先が E2E を全部流す呼び出しを着手中の1件の上限まで数えて止める判定を、関数で確かめる。
// PreToolUse hook の約束（終了コード 2 で実行を止める・形が違えば通す）は、スクリプトを起こして確かめる。

import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import { describe, expect, test } from "vitest"

import {
  countFullE2eRuns,
  isOverLimitAfterRecording,
  RUN_LIMIT,
} from "../../scripts/lib/e2e-run-limit.ts"
import { runSubprocess, runSubprocessOrThrow } from "../fixture/subprocess.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

const HOOK_PATH = resolve("scripts/deny-e2e-run-limit.ts")
const FILE_UNIT_E2E = "pnpm run test:e2e test/e2e/example.test.ts"

describe("E2E を全部流すコマンドの数え方", () => {
  test.each([
    ["tw verify", "tw verify"],
    ["pnpm run check", "pnpm run check"],
    ["pnpm run test:e2e", "pnpm run test:e2e"],
    ["nice を前置きした check", "nice pnpm run check"],
    ["ファイルを渡さない期待値の撮り直し", "node scripts/e2e-update.ts --full"],
    ["E2E の設定でファイルを指さない vitest", "vitest run --config vitest.e2e.config.ts"],
  ])("%s は1回と数える", (_name, command) => {
    expect(countFullE2eRuns(command)).toBe(1)
  })

  test("1つのコマンド文字列の中の呼び出しは、その数だけ数える", () => {
    expect(countFullE2eRuns("tw verify && pnpm run check")).toBe(2)
  })

  test.each([
    ["ファイル単位の pnpm", FILE_UNIT_E2E],
    [
      "ファイルを指した vitest",
      "vitest run --config vitest.e2e.config.ts test/e2e/example.test.ts",
    ],
    ["別のサブコマンド verify-check", "tw verify-check"],
    ["E2E を含まない pnpm のスクリプト", "pnpm run test"],
    ["tw verify を文字列として持つだけの echo", "echo 'tw verify'"],
  ])("%s は数えない", (_name, command) => {
    expect(countFullE2eRuns(command)).toBe(0)
  })
})

describe("着手中の1件ごとの上限", () => {
  const tempDir = useTempDir("e2e-run-limit")

  function newGitDir(name: string): string {
    const gitDir = join(tempDir(), name)
    mkdirSync(gitDir, { recursive: true })
    return gitDir
  }

  function claimPath(gitDir: string, taskId: string): string {
    return join(gitDir, "task-open-claims", taskId)
  }

  function claim(gitDir: string, taskId: string): void {
    mkdirSync(join(gitDir, "task-open-claims"), { recursive: true })
    writeFileSync(claimPath(gitDir, taskId), "")
  }

  function runsUpTo(gitDir: string, times: number): boolean[] {
    return Array.from({ length: times }, () => isOverLimitAfterRecording(gitDir, 1))
  }

  test("上限まで通し、その次を止める", () => {
    const gitDir = newGitDir("a")
    claim(gitDir, "TASK-A")
    expect(runsUpTo(gitDir, RUN_LIMIT)).toEqual(Array.from({ length: RUN_LIMIT }, () => false))
    expect(isOverLimitAfterRecording(gitDir, 1)).toBe(true)
  })

  test("1回で上限を超える数も止める", () => {
    const gitDir = newGitDir("a")
    claim(gitDir, "TASK-A")
    expect(isOverLimitAfterRecording(gitDir, RUN_LIMIT + 1)).toBe(true)
  })

  test("着手の印が無いときは数えずに通す", () => {
    const gitDir = newGitDir("a")
    expect(runsUpTo(gitDir, RUN_LIMIT + 2).some(Boolean)).toBe(false)
  })

  test("着手し直す（印を消して作り直す）と数が戻る", () => {
    const gitDir = newGitDir("a")
    claim(gitDir, "TASK-A")
    runsUpTo(gitDir, RUN_LIMIT)
    expect(isOverLimitAfterRecording(gitDir, 1)).toBe(true)

    const before = statSync(claimPath(gitDir, "TASK-A")).birthtimeMs
    do {
      rmSync(claimPath(gitDir, "TASK-A"))
      claim(gitDir, "TASK-A")
    } while (statSync(claimPath(gitDir, "TASK-A")).birthtimeMs === before)
    expect(isOverLimitAfterRecording(gitDir, 1)).toBe(false)
  })

  test("別の作業ツリーの数とは混ざらない", () => {
    const gitDir = newGitDir("a")
    const otherGitDir = newGitDir("b")
    claim(gitDir, "TASK-A")
    claim(otherGitDir, "TASK-A")
    runsUpTo(gitDir, RUN_LIMIT)
    expect(isOverLimitAfterRecording(gitDir, 1)).toBe(true)
    expect(isOverLimitAfterRecording(otherGitDir, 1)).toBe(false)
  })
})

describe("委譲先の E2E 全段の呼び出しを上限で拒否する hook", () => {
  const tempDir = useTempDir("e2e-run-limit-hook")

  async function newClaimedRepo(): Promise<string> {
    const dir = tempDir()
    await runSubprocessOrThrow("git", ["init", "--quiet"], { cwd: dir })
    mkdirSync(join(dir, ".git", "task-open-claims"), { recursive: true })
    writeFileSync(join(dir, ".git", "task-open-claims", "TASK-A"), "")
    return dir
  }

  function runHook(dir: string, input: string): ReturnType<typeof runSubprocess> {
    return runSubprocess(process.execPath, [HOOK_PATH], {
      input,
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    })
  }

  function bashInput(command: string, agent: boolean): string {
    return JSON.stringify({
      tool_name: "Bash",
      tool_input: { command },
      ...(agent ? { agent_id: "subagent-1", agent_type: "no-delegate" } : {}),
    })
  }

  const OVER_LIMIT_COMMAND = Array.from({ length: RUN_LIMIT + 1 }, () => "tw verify").join("; ")

  test("上限を超える呼び出しは終了コード 2 で止め、ファイル単位の実行を打ってよいことを書く", async () => {
    const dir = await newClaimedRepo()
    const result = await runHook(dir, bashInput(OVER_LIMIT_COMMAND, true))
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("pnpm run test:e2e test/e2e/")
  })

  test("メインの呼び出しは上限を超えても通す", async () => {
    const dir = await newClaimedRepo()
    expect((await runHook(dir, bashInput(OVER_LIMIT_COMMAND, false))).exitCode).toBe(0)
  })

  test("Bash 以外のツールには関わらない", async () => {
    const dir = await newClaimedRepo()
    const input = JSON.stringify({
      tool_name: "Read",
      tool_input: { command: OVER_LIMIT_COMMAND },
      agent_id: "subagent-1",
    })
    expect((await runHook(dir, input)).exitCode).toBe(0)
  })

  test("形が違う入力では実行を止めない", async () => {
    const dir = await newClaimedRepo()
    expect((await runHook(dir, "これは JSON ではない")).exitCode).toBe(0)
  })
})
