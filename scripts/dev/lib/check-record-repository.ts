// `pnpm run check` の控え（リポジトリの根の `.check-record.json`）の読み書きと、
// 控えの鍵にする作業ツリーの木の SHA を取ること、という概念1つを持つ。`git` だけを呼ぶ。

import { execFileSync } from "node:child_process"
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { type CheckRecord, EMPTY_CHECK_RECORD, type RecordedStage } from "./check-record.ts"

const RECORD_FILE_NAME = ".check-record.json"
const LEDGER_FILE_NAME = "flaky-ledger.jsonl"

const RECORDED_RESULTS = ["passed", "carried", "failed"] as const

/**
 * いまの作業ツリーの中身の木の SHA。取れなければ空。
 * 一時の index で `git add -A` → `git write-tree` するので、未追跡のファイルは入り、`.gitignore` の対象は入らない。
 * 新しい object は一時ディレクトリに書き、`.git` にも本物の index にも書かない。
 */
export function worktreeTree(root: string): string {
  const scratch = mkdtempSync(join(tmpdir(), "tsukumo-check-tree-"))
  try {
    const realIndex = git(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
    const realObjects = git(root, ["rev-parse", "--path-format=absolute", "--git-path", "objects"])
    const index = join(scratch, "index")
    if (existsSync(realIndex)) {
      // 時刻を保たないと、同じ秒・同じ大きさの書き換えを git が無変更とみなす
      cpSync(realIndex, index, { preserveTimestamps: true })
    }
    const objects = join(scratch, "objects")
    mkdirSync(objects)
    const env = {
      ...process.env,
      GIT_INDEX_FILE: index,
      GIT_OBJECT_DIRECTORY: objects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: realObjects,
    }
    git(root, ["add", "-A"], env)
    return git(root, ["write-tree"], env)
  } catch {
    return ""
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** 無い・読めない・形が違う控えは空の控えに畳む。 */
export function readCheckRecord(root: string): CheckRecord {
  try {
    return parseRecord(JSON.parse(readFileSync(recordPath(root), "utf8")))
  } catch {
    return EMPTY_CHECK_RECORD
  }
}

/** 書きかけの控えを読ませないよう、一時ファイルに書いてから置き換える。 */
export function writeCheckRecord(root: string, record: CheckRecord): void {
  const temporary = `${recordPath(root)}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(record)}\n`)
  renameSync(temporary, recordPath(root))
}

export function removeCheckRecord(root: string): void {
  rmSync(recordPath(root), { force: true })
}

/** 控えの隣の台帳に、flaky の1件を1行で足す。 */
export function appendFlakyLedger(root: string, lines: readonly string[]): void {
  if (lines.length > 0) {
    appendFileSync(join(root, LEDGER_FILE_NAME), `${lines.join("\n")}\n`)
  }
}

function recordPath(root: string): string {
  return join(root, RECORD_FILE_NAME)
}

function git(root: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync("git", [...args], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
}

function parseRecord(value: unknown): CheckRecord {
  if (!isRecord(value) || typeof value.tree !== "string" || !Array.isArray(value.stages)) {
    return EMPTY_CHECK_RECORD
  }
  const stages = value.stages.flatMap((stage: unknown): readonly RecordedStage[] => {
    const parsed = parseStage(stage)
    return parsed === undefined ? [] : [parsed]
  })
  return stages.length === value.stages.length ? { tree: value.tree, stages } : EMPTY_CHECK_RECORD
}

function parseStage(value: unknown): RecordedStage | undefined {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    !isStringArray(value.args) ||
    !isStringArray(value.retryFiles)
  ) {
    return undefined
  }
  const result = RECORDED_RESULTS.find((candidate) => candidate === value.result)
  const failedTests = isStringArray(value.failedTests) ? value.failedTests : []
  return result === undefined
    ? undefined
    : { name: value.name, args: value.args, result, retryFiles: value.retryFiles, failedTests }
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
