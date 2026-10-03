// 委譲先が E2E を全部流す呼び出しを着手中の1件の上限まで数えて止める PreToolUse hook の契約
// （終了コード 2 で実行を止める）を、スクリプトを実際に起こして確かめる。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import process from "node:process"
import { setTimeout as sleep } from "node:timers/promises"

import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"

const HOOK_PATH = resolve("scripts/deny-e2e-run-limit.ts")
const RUN_LIMIT = 6
const FILE_UNIT_E2E = "pnpm run test:e2e test/e2e/example.test.ts"

let repoDir = ""
let otherRepoDir = ""

beforeEach(async () => {
  repoDir = await newRepo()
  otherRepoDir = await newRepo()
})

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true })
  rmSync(otherRepoDir, { recursive: true, force: true })
})

describe("委譲先の E2E 全段の呼び出しを上限で拒否する hook", () => {
  test.each([
    ["tw verify", "tw verify"],
    ["pnpm run check", "pnpm run check"],
    ["pnpm run test:e2e", "pnpm run test:e2e"],
    ["nice を前置きした check", "nice pnpm run check"],
    ["E2E の設定でファイルを指さない vitest", "vitest run --config vitest.e2e.config.ts"],
  ])("%s は上限まで通し、その次を止める", async (_name, command) => {
    claim(repoDir, "TASK-A")
    for (let count = 0; count < RUN_LIMIT; count++) {
      expect(await runHook(repoDir, command, { fromSubagent: true })).toBe(0)
    }
    expect(await runHook(repoDir, command, { fromSubagent: true })).toBe(2)
  })

  test("止めるときの理由に、ファイル単位の実行を打ってよいことを書く", async () => {
    claim(repoDir, "TASK-A")
    await runMany(repoDir, "tw verify", RUN_LIMIT)
    const result = await runHookResult(repoDir, "tw verify", { fromSubagent: true })
    expect(result.stderr).toContain("pnpm run test:e2e test/e2e/")
  })

  test("ファイル単位の E2E は上限を超えても通し、数えない", async () => {
    claim(repoDir, "TASK-A")
    await runMany(repoDir, "tw verify", RUN_LIMIT)
    expect(await runHook(repoDir, FILE_UNIT_E2E, { fromSubagent: true })).toBe(0)
    expect(
      await runHook(repoDir, "vitest run --config vitest.e2e.config.ts test/e2e/example.test.ts", {
        fromSubagent: true,
      }),
    ).toBe(0)
  })

  test("ファイル単位の E2E は数に入らない", async () => {
    claim(repoDir, "TASK-A")
    await runMany(repoDir, FILE_UNIT_E2E, RUN_LIMIT + 3)
    await runMany(repoDir, "tw verify", RUN_LIMIT)
    expect(await runHook(repoDir, "tw verify", { fromSubagent: true })).toBe(2)
  })

  test("メインの呼び出しは上限を超えても通す", async () => {
    claim(repoDir, "TASK-A")
    await runMany(repoDir, "tw verify", RUN_LIMIT)
    expect(await runHook(repoDir, "tw verify", { fromSubagent: false })).toBe(0)
  })

  test("メインの呼び出しは数に入らない", async () => {
    claim(repoDir, "TASK-A")
    await runManyFromMain(repoDir, "tw verify", RUN_LIMIT + 2)
    expect(await runHook(repoDir, "tw verify", { fromSubagent: true })).toBe(0)
  })

  test("着手の印が無いときは数えずに通す", async () => {
    await runMany(repoDir, "tw verify", RUN_LIMIT + 2)
    expect(await runHook(repoDir, "tw verify", { fromSubagent: true })).toBe(0)
  })

  test("着手し直す（印を消して作り直す）と数が戻る", async () => {
    claim(repoDir, "TASK-A")
    await runMany(repoDir, "tw verify", RUN_LIMIT)
    expect(await runHook(repoDir, "tw verify", { fromSubagent: true })).toBe(2)

    rmSync(join(repoDir, ".git", "task-open-claims", "TASK-A"))
    await sleep(20)
    claim(repoDir, "TASK-A")
    expect(await runHook(repoDir, "tw verify", { fromSubagent: true })).toBe(0)
  })

  test("別の作業ツリーの数とは混ざらない", async () => {
    claim(repoDir, "TASK-A")
    claim(otherRepoDir, "TASK-A")
    await runMany(repoDir, "tw verify", RUN_LIMIT)
    expect(await runHook(repoDir, "tw verify", { fromSubagent: true })).toBe(2)
    expect(await runHook(otherRepoDir, "tw verify", { fromSubagent: true })).toBe(0)
  })

  test.each([
    ["別のサブコマンド verify-check", "tw verify-check"],
    ["E2E を含まない pnpm のスクリプト", "pnpm run test"],
    ["tw verify を文字列として持つだけの echo", "echo 'tw verify'"],
  ])("%s は数えない", async (_name, command) => {
    claim(repoDir, "TASK-A")
    await runMany(repoDir, command, RUN_LIMIT + 2)
    expect(await runHook(repoDir, command, { fromSubagent: true })).toBe(0)
  })

  test("Bash 以外のツールには関わらない", async () => {
    claim(repoDir, "TASK-A")
    await runMany(repoDir, "tw verify", RUN_LIMIT)
    expect(
      await runRaw(
        repoDir,
        JSON.stringify({
          tool_name: "Read",
          tool_input: { command: "tw verify" },
          agent_id: "subagent-1",
        }),
      ),
    ).toBe(0)
  })

  test("形が違う入力では実行を止めない", async () => {
    expect(await runRaw(repoDir, "これは JSON ではない")).toBe(0)
  })
})

async function newRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "e2e-run-limit-"))
  await runSubprocess("git", ["init", "--quiet"], { cwd: dir })
  return dir
}

function claim(dir: string, taskId: string): void {
  const claimsDir = join(dir, ".git", "task-open-claims")
  mkdirSync(claimsDir, { recursive: true })
  writeFileSync(join(claimsDir, taskId), "")
}

async function runMany(dir: string, command: string, times: number): Promise<void> {
  for (let count = 0; count < times; count++) {
    await runHook(dir, command, { fromSubagent: true })
  }
}

async function runManyFromMain(dir: string, command: string, times: number): Promise<void> {
  for (let count = 0; count < times; count++) {
    await runHook(dir, command, { fromSubagent: false })
  }
}

function runHook(
  dir: string,
  command: string,
  options: { readonly fromSubagent: boolean },
): Promise<number | undefined> {
  return runHookResult(dir, command, options).then((result) => result.exitCode)
}

function runHookResult(
  dir: string,
  command: string,
  options: { readonly fromSubagent: boolean },
): ReturnType<typeof runSubprocess> {
  return runSubprocessWithInput(
    dir,
    JSON.stringify({
      tool_name: "Bash",
      tool_input: { command },
      ...(options.fromSubagent ? { agent_id: "subagent-1", agent_type: "no-delegate" } : {}),
    }),
  )
}

async function runRaw(dir: string, input: string): Promise<number | undefined> {
  return (await runSubprocessWithInput(dir, input)).exitCode
}

function runSubprocessWithInput(dir: string, input: string): ReturnType<typeof runSubprocess> {
  return runSubprocess(process.execPath, [HOOK_PATH], {
    input,
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  })
}
