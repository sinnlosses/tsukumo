// E2E を全部流すコマンドの判定と、着手中の1件ごとの回数の控え。
// 数はこの作業ツリー固有の git dir の `e2e-full-runs` に置く。着手の印（`task-open-claims/<id>`）が
// 無ければ数えない。印が消えて作り直されると鍵（`id:birthtimeMs`）が変わり、数が戻る。

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { parseShellCommand, type SimpleCommand } from "./shell-command.ts"

/** 着手中の1件につき、E2E を全部流してよい回数。 */
export const RUN_LIMIT = 6

const RUNS_FILE_NAME = "e2e-full-runs"
const OPEN_CLAIMS_DIR_NAME = "task-open-claims"

const E2E_CONFIG_NAME = "vitest.e2e.config.ts"

/** コマンド文字列の中で、E2E を全部流す単純コマンドの数。 */
export function countFullE2eRuns(commandText: string): number {
  return parseShellCommand(commandText).filter(isFullE2eRun).length
}

/** 今回の `runs` 回を数に足し、足した結果が上限を超えるか。数えられないときは超えない。 */
export function isOverLimitAfterRecording(gitDir: string, runs: number): boolean {
  try {
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
