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

/** E2E を流すと決まっている呼び出しの数と、`--full` が無く変えたファイル次第の呼び出しの数。 */
export type E2eRunCounts = { readonly always: number; readonly byChange: number }

/** `twVerifyCommand` は `tw verify` が打つコマンド。空（読めない）なら `tw verify` の引数だけで分類する。 */
export function countE2eRuns(commandText: string, twVerifyCommand: string): E2eRunCounts {
  const twVerifyKind = classifyCommandText(twVerifyCommand)
  const kinds = parseShellCommand(commandText).map((simple) => classifyE2eRun(simple, twVerifyKind))
  return {
    always: kinds.filter((kind) => kind === "always").length,
    byChange: kinds.filter((kind) => kind === "by-change").length,
  }
}

/** 変えたファイルが E2E を流すもの（`changeRunsE2e`）なら、次第の呼び出しも数に入れる。 */
export function countFullE2eRuns(counts: E2eRunCounts, changeRunsE2e: boolean): number {
  return counts.always + (changeRunsE2e ? counts.byChange : 0)
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

type E2eRunKind = "always" | "by-change" | "no"

/** `tw verify` の呼び出しの分類。打つコマンドが読めていなければ `unread`。 */
type TwVerifyKind = E2eRunKind | "unread"

/** `tw verify` が打つコマンドの分類。入れ子の `tw verify` は数えない。 */
function classifyCommandText(commandText: string): TwVerifyKind {
  if (commandText.trim() === "") {
    return "unread"
  }
  const kinds = parseShellCommand(commandText).map((simple) => classifyE2eRun(simple, "no"))
  if (kinds.includes("always")) {
    return "always"
  }
  return kinds.includes("by-change") ? "by-change" : "no"
}

function classifyE2eRun(simple: SimpleCommand, twVerifyKind: TwVerifyKind): E2eRunKind {
  const words = withoutNice(simple.argv.map((word) => word.text))
  const [head = "", ...rest] = words
  if (head === "tw") {
    if (rest[0] !== "verify") {
      return "no"
    }
    return twVerifyKind === "unread" || rest.includes("--full") ? checkKind(rest) : twVerifyKind
  }
  if (head === "node") {
    const [script = "", ...scriptArgs] = rest
    if (script === "scripts/check.ts") {
      return checkKind(scriptArgs)
    }
    return script === "scripts/e2e-update.ts" && scriptArgs.every((arg) => arg.startsWith("-"))
      ? "always"
      : "no"
  }
  if (head === "pnpm") {
    return classifyPnpmScript(rest)
  }
  return isFullVitestE2e(words) ? "always" : "no"
}

/** `check` の系統の呼び出し。`--full` なら必ず流し、無ければ変えたファイル次第。 */
function checkKind(args: readonly string[]): "always" | "by-change" {
  return args.includes("--full") ? "always" : "by-change"
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
function classifyPnpmScript(args: readonly string[]): "always" | "by-change" | "no" {
  const [script = "", ...scriptArgs] = args[0] === "run" ? args.slice(1) : args
  if (script === "check") {
    return checkKind(scriptArgs)
  }
  if (script === "test:e2e" || script === "test:e2e:update") {
    return scriptArgs.every((arg) => arg.startsWith("-") || arg === "--") ? "always" : "no"
  }
  return "no"
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
