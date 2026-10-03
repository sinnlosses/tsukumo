// 委譲先のサブエージェントが E2E を全部流すコマンド（`tw verify`・`pnpm run check`・
// `pnpm run test:e2e` など）を、着手中の1件の中で上限を超えて打つのを、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
// メインの呼び出しには `agent_id` が入らないので対象にしない。E2E のファイル単位の実行は数えない。
//
// 数はこの作業ツリー固有の git dir の `e2e-full-runs` に置く。着手の印（`task-open-claims/<id>`）が
// 無ければ数えない。印が消えて作り直されると鍵（`id:birthtimeMs`）が変わり、数が戻る。
//
// hook の約束: 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す）。

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { recordHookDenial } from "./lib/hook-denial-record.ts"
import { parseShellCommand, type SimpleCommand } from "./lib/shell-command.ts"

/** 着手中の1件につき、E2E を全部流してよい回数。 */
const RUN_LIMIT = 6

const RUNS_FILE_NAME = "e2e-full-runs"
const OPEN_CLAIMS_DIR_NAME = "task-open-claims"

const E2E_CONFIG_NAME = "vitest.e2e.config.ts"

/** Bash ツールの PreToolUse hook の入力のうち、この hook が見るところ。 */
type PreToolUseHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown }
  readonly agent_id?: unknown
}

const raw = await readStdin()
const command = readSubagentBashCommand(raw)
if (command !== undefined) {
  const runs = countFullE2eRuns(command)
  if (runs > 0 && isOverLimitAfterRecording(runs)) {
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

/** コマンド文字列の中で、E2E を全部流す単純コマンドの数。 */
function countFullE2eRuns(commandText: string): number {
  return parseShellCommand(commandText).filter(isFullE2eRun).length
}

function isFullE2eRun(simple: SimpleCommand): boolean {
  const words = withoutNice(simple.argv.map((word) => word.text))
  const [head = "", ...rest] = words
  if (head === "tw") {
    return rest[0] === "verify"
  }
  if (head === "node") {
    const [script = "", ...scriptArgs] = rest
    return (
      script === "scripts/check.ts" ||
      (script === "scripts/e2e-update.ts" && scriptArgs.every((arg) => arg.startsWith("-")))
    )
  }
  if (head === "pnpm") {
    return isFullPnpmScript(rest)
  }
  return isFullVitestE2e(words)
}

function withoutNice(words: readonly string[]): readonly string[] {
  if (words[0] !== "nice") {
    return words
  }
  const rest = words.slice(1)
  const commandAt = rest.findIndex((word) => !isNiceOption(word))
  return commandAt < 0 ? [] : rest.slice(commandAt)
}

function isNiceOption(word: string): boolean {
  return word.startsWith("-") || /^\d+$/.test(word)
}

/** `pnpm [run] <script> ...` が `check` か、ファイルを渡していない `test:e2e` か。 */
function isFullPnpmScript(args: readonly string[]): boolean {
  const [script = "", ...scriptArgs] = args[0] === "run" ? args.slice(1) : args
  if (script === "check") {
    return true
  }
  if (script === "test:e2e" || script === "test:e2e:update") {
    return scriptArgs.every((arg) => arg.startsWith("-") || arg === "--")
  }
  return false
}

/** `vitest` に E2E の設定を渡し、ファイルの位置引数が無い形か。 */
function isFullVitestE2e(words: readonly string[]): boolean {
  const vitestAt = words.indexOf("vitest")
  if (vitestAt < 0 || !words.includes(E2E_CONFIG_NAME)) {
    return false
  }
  const positionals: string[] = []
  const after = words.slice(vitestAt + 1)
  for (let index = 0; index < after.length; index++) {
    const word = after[index] ?? ""
    if (word === "--config" || word === "-c") {
      index++
    } else if (!word.startsWith("-") && word !== "run") {
      positionals.push(word)
    }
  }
  return positionals.length === 0
}

/** 今回の `runs` 回を数に足し、足した結果が上限を超えるか。数えられないときは超えない。 */
function isOverLimitAfterRecording(runs: number): boolean {
  try {
    const projectDir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd()
    const gitDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-dir"], {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const key = openClaimsKey(gitDir)
    if (key === undefined) {
      return false
    }
    const runsPath = join(gitDir, RUNS_FILE_NAME)
    const before = readRunCount(runsPath, key)
    if (before + runs > RUN_LIMIT) {
      return true
    }
    writeFileSync(runsPath, `${key}\n${"x\n".repeat(before + runs)}`)
    return false
  } catch {
    return false
  }
}

/** 開いている着手の印を `id:birthtimeMs` で並べた鍵。印が無ければ `undefined`。 */
function openClaimsKey(gitDir: string): string | undefined {
  const claimsDir = join(gitDir, OPEN_CLAIMS_DIR_NAME)
  if (!existsSync(claimsDir)) {
    return undefined
  }
  const ids = readdirSync(claimsDir).toSorted()
  if (ids.length === 0) {
    return undefined
  }
  return ids.map((id) => `${id}:${statSync(join(claimsDir, id)).birthtimeMs}`).join(",")
}

/** 控えの鍵が今の鍵と同じときだけ、記録済みの回数を返す。違えば0。 */
function readRunCount(runsPath: string, key: string): number {
  if (!existsSync(runsPath)) {
    return 0
  }
  const [recordedKey, ...runLines] = readFileSync(runsPath, "utf8").split("\n")
  return recordedKey === key ? runLines.filter((line) => line !== "").length : 0
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
