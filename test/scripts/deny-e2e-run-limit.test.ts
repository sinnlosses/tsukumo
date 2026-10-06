// 委譲先が E2E を全部流す呼び出しを着手中の1件の上限まで数えて止める判定を、関数で確かめる。
// PreToolUse hook の約束（終了コード 2 で実行を止める・形が違えば通す）は、スクリプトを起こして確かめる。

import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import { describe, expect, test } from "vitest"

import {
  countE2eRuns,
  countFullE2eRuns,
  isOverLimitAfterRecording,
  RUN_LIMIT,
} from "../../scripts/lib/e2e-run-limit.ts"
import { readTwVerifyCommand } from "../../scripts/lib/verify-command-repository.ts"
import { runSubprocess, runSubprocessOrThrow } from "../fixture/subprocess.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

const HOOK_PATH = resolve("scripts/deny-e2e-run-limit.ts")
const FILE_UNIT_E2E = "pnpm run test:e2e test/e2e/example.test.ts"

function countOf(command: string, changeRunsE2e: boolean, twVerifyCommand = ""): number {
  return countFullE2eRuns(countE2eRuns(command, twVerifyCommand), changeRunsE2e)
}

describe("E2E を全部流すコマンドの数え方", () => {
  test.each([
    ["tw verify --full", "tw verify --full"],
    ["pnpm run check --full", "pnpm run check --full"],
    ["node scripts/check.ts --full", "node scripts/check.ts --full"],
    ["pnpm run test:e2e", "pnpm run test:e2e"],
    ["nice を前置きした check --full", "nice pnpm run check --full"],
    ["ファイルを渡さない期待値の撮り直し", "node scripts/e2e-update.ts --full"],
    ["E2E の設定でファイルを指さない vitest", "vitest run --config vitest.e2e.config.ts"],
  ])("%s は変えたファイルに関わらず1回と数える", (_name, command) => {
    expect(countOf(command, false)).toBe(1)
  })

  test.each([
    ["tw verify", "tw verify"],
    ["pnpm run check", "pnpm run check"],
    ["node scripts/check.ts", "node scripts/check.ts"],
  ])("%s は E2E が選ばれる変更のときだけ1回と数える", (_name, command) => {
    expect(countOf(command, true)).toBe(1)
    expect(countOf(command, false)).toBe(0)
  })

  test("tw verify が打つコマンドが check --full なら、変えたファイルに関わらず1回と数える", () => {
    expect(countOf("tw verify", false, "pnpm run check --full")).toBe(1)
  })

  test("tw verify が打つコマンドが --full の無い check なら、E2E が選ばれる変更のときだけ数える", () => {
    expect(countOf("tw verify", true, "pnpm run check")).toBe(1)
    expect(countOf("tw verify", false, "pnpm run check")).toBe(0)
  })

  test("tw verify が打つコマンドが E2E を流さないなら、数えない", () => {
    expect(countOf("tw verify", true, "pnpm run test")).toBe(0)
  })

  test("1つのコマンド文字列の中の呼び出しは、その数だけ数える", () => {
    expect(countOf("tw verify && pnpm run check --full", false)).toBe(1)
    expect(countOf("tw verify && pnpm run check", true)).toBe(2)
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
    expect(countOf(command, true)).toBe(0)
  })
})

describe("tw verify が打つコマンドの読み方", () => {
  const tempDir = useTempDir("tw-verify-command")

  function section(lines: readonly string[]): string {
    return `# 架空\n\n## タスク運用\n\n${lines.join("\n")}\n`
  }

  function write(name: string, text: string): void {
    writeFileSync(join(tempDir(), name), text)
  }

  test("送る前の検証コマンドの行があれば、検証コマンドの行より先にそれを読む", () => {
    write(
      "CLAUDE.md",
      section([
        "- 検証コマンド: `pnpm run check`",
        "- 送る前の検証コマンド: `pnpm run check --full`",
      ]),
    )
    expect(readTwVerifyCommand(tempDir())).toBe("pnpm run check --full")
  })

  test.each([
    ["行が無い", ["- 検証コマンド: `pnpm run check`"]],
    ["値が なし で始まる", ["- 検証コマンド: `pnpm run check`", "- 送る前の検証コマンド: なし"]],
  ])("送る前の検証コマンドの%sときは、検証コマンドの行を読む", (_name, lines) => {
    write("CLAUDE.md", section(lines))
    expect(readTwVerifyCommand(tempDir())).toBe("pnpm run check")
  })

  test("AGENTS.md に節があれば CLAUDE.md より先にそちらを読む", () => {
    write("AGENTS.md", section(["- 検証コマンド: `pnpm run agents-check`"]))
    write("CLAUDE.md", section(["- 検証コマンド: `pnpm run claude-check`"]))
    expect(readTwVerifyCommand(tempDir())).toBe("pnpm run agents-check")
  })

  test("AGENTS.md に節が無ければ CLAUDE.md を読む", () => {
    write("AGENTS.md", "# 架空\n\n- 検証コマンド: `pnpm run agents-check`\n")
    write("CLAUDE.md", section(["- 検証コマンド: `pnpm run claude-check`"]))
    expect(readTwVerifyCommand(tempDir())).toBe("pnpm run claude-check")
  })

  test.each([
    ["設定ファイルが無い", undefined],
    ["節が無い", "# 架空\n\n- 検証コマンド: `pnpm run check`\n"],
    ["コマンドの行が無い", section(["- 整形コマンド: `pnpm run format`"])],
  ])("%sときは空文字を返す", (_name, text) => {
    if (text !== undefined) {
      write("CLAUDE.md", text)
    }
    expect(readTwVerifyCommand(tempDir())).toBe("")
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

  const OVER_LIMIT_COMMAND = Array.from({ length: RUN_LIMIT + 1 }, () => "tw verify --full").join(
    "; ",
  )

  async function newClaimedRepoWithChange(changedFile: string): Promise<string> {
    const dir = await newClaimedRepo()
    mkdirSync(join(dir, ".tsukumo"), { recursive: true })
    writeFileSync(
      join(dir, ".tsukumo", "project.json"),
      JSON.stringify({ tasks: { mainBranch: "main", runPrompt: "/next-task {id}" } }),
    )
    await runSubprocessOrThrow("git", ["add", ".tsukumo/project.json"], { cwd: dir })
    await runSubprocessOrThrow(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "-m", "base"],
      { cwd: dir },
    )
    await runSubprocessOrThrow("git", ["branch", "-M", "main"], { cwd: dir })
    mkdirSync(join(dir, changedFile, ".."), { recursive: true })
    writeFileSync(join(dir, changedFile), "// changed\n")
    return dir
  }

  const OVER_LIMIT_BY_CHANGE = Array.from({ length: RUN_LIMIT + 1 }, () => "tw verify").join("; ")

  test.each([
    ["文書だけ", "docs/workflow.md"],
    ["scripts/ だけ", "scripts/example.ts"],
  ])("E2E が選ばれない変更（%s）では tw verify を上限を超えて打っても通す", async (_name, file) => {
    const dir = await newClaimedRepoWithChange(file)
    expect((await runHook(dir, bashInput(OVER_LIMIT_BY_CHANGE, true))).exitCode).toBe(0)
  })

  test("送る前の検証コマンドが check --full なら、文書だけの変更でも tw verify の上限を超える呼び出しを止める", async () => {
    const dir = await newClaimedRepoWithChange("docs/workflow.md")
    writeFileSync(
      join(dir, "CLAUDE.md"),
      "# 架空\n\n## タスク運用\n\n- 送る前の検証コマンド: `pnpm run check --full`\n",
    )
    expect((await runHook(dir, bashInput(OVER_LIMIT_BY_CHANGE, true))).exitCode).toBe(2)
  })

  test("E2E が選ばれる変更（src/browser/）では tw verify の上限を超える呼び出しを止める", async () => {
    const dir = await newClaimedRepoWithChange("src/browser/example.ts")
    expect((await runHook(dir, bashInput(OVER_LIMIT_BY_CHANGE, true))).exitCode).toBe(2)
  })

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
