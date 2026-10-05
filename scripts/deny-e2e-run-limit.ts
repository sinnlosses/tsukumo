// 委譲先のサブエージェントが E2E を全部流すコマンド（`tw verify`・`pnpm run check`・
// `pnpm run test:e2e` など）を、着手中の1件の中で上限を超えて打つのを、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
// メインの呼び出しには `agent_id` が入らないので対象にしない。E2E のファイル単位の実行は数えない。
//
// hook の約束: 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import { execFileSync } from "node:child_process"
import process from "node:process"

import { collectChangedPaths, resolvePrimaryBranch } from "./lib/changed-path-repository.ts"
import {
  countE2eRuns,
  countFullE2eRuns,
  isOverLimitAfterRecording,
  RUN_LIMIT,
} from "./lib/e2e-run-limit.ts"
import { planE2eRun } from "./lib/e2e-selection-repository.ts"
import { recordHookDenial } from "./lib/hook-denial-record.ts"

/** Bash ツールの PreToolUse hook の入力のうち、この hook が見るところ。 */
type PreToolUseHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown }
  readonly agent_id?: unknown
}

const raw = await readStdin()
const command = readSubagentBashCommand(raw)
if (command !== undefined) {
  const counts = countE2eRuns(command)
  const changeRunsE2e = counts.byChange > 0 && (await readChangeRunsE2e())
  const runs = countFullE2eRuns(counts, changeRunsE2e)
  const gitDir = runs > 0 ? readGitDir() : undefined
  if (gitDir !== undefined && isOverLimitAfterRecording(gitDir, runs)) {
    recordHookDenial({ hook: "deny-e2e-run-limit", rule: "run-limit", actor: "subagent" })
    process.stderr.write(refusal())
    process.exit(2)
  }
}

function refusal(): string {
  return `E2E を全部流す呼び出し（\`tw verify\`・\`pnpm run check\`・\`pnpm run test:e2e\`）が、
着手中の1件の上限（${RUN_LIMIT}回）に達した。これ以上は打たない。

E2E のファイル単位の実行は数えないので打ってよい:

  pnpm run test:e2e test/e2e/<ファイル>.test.ts
`
}

/** 委譲先の Bash の呼び出しなら、そのコマンド文字列。それ以外・形が違えば `undefined`。 */
function readSubagentBashCommand(rawInput: string): string | undefined {
  const parsed: unknown = safeParse(rawInput)
  if (typeof parsed !== "object" || parsed === null) {
    return undefined
  }
  const input = parsed as PreToolUseHookInput
  if (input.tool_name !== "Bash" || typeof input.agent_id !== "string") {
    return undefined
  }
  const command = input.tool_input?.command
  return typeof command === "string" ? command : undefined
}

/** この作業ツリーの git dir。引けなければ `undefined`。 */
function readGitDir(): string | undefined {
  return readGit(["rev-parse", "--path-format=absolute", "--git-dir"])
}

/** 変えたファイルから選ぶと `check` が E2E を流すか。調べられないときは流さない側に倒す。 */
async function readChangeRunsE2e(): Promise<boolean> {
  try {
    const root = readGit(["rev-parse", "--show-toplevel"])
    if (root === undefined) {
      return false
    }
    const changedPaths = collectChangedPaths(root, await resolvePrimaryBranch(root))
    return planE2eRun(root, changedPaths, false).kind === "run"
  } catch {
    return false
  }
}

function readGit(args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", [...args], {
      cwd: process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return undefined
  }
}

function safeParse(rawInput: string): unknown {
  try {
    return JSON.parse(rawInput)
  } catch {
    return undefined
  }
}

async function readStdin(): Promise<string> {
  const chunks: string[] = []
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string)
  }
  return chunks.join("")
}
