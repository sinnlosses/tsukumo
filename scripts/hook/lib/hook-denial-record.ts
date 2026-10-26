// hook が拒んだ回数の記録。時刻・hook の名前・規則のキー・誰の呼び出しかだけを残す。
// コマンドの全文・パス・会話の中身は入れない。
//
// 置き場は共有の git dir の `hook-denials/<年-月>.jsonl`（作業ツリーをまたいで1つ。コミットしない）。
// 書き込みの失敗は黙って握りつぶす。hook の終了コードと stderr を変えないため。

import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { readGitCommonDirectory } from "../../shared/git-query.ts"

const DIRECTORY_NAME = "hook-denials"

export type DenialActor = "main" | "subagent"

export type HookDenial = {
  readonly at: string
  readonly hook: string
  readonly rule: string
  readonly actor: DenialActor
  /** log-only で拒まなかった行だけに付く。欄が無い行は block で拒んだもの。 */
  readonly mode?: "log-only"
}

/** 呼び手の欄が無い旧い行の呼び手。 */
export const UNKNOWN_ACTOR = "不明"

export type RecordedHookDenial = Omit<HookDenial, "actor" | "mode"> & {
  readonly actor: DenialActor | typeof UNKNOWN_ACTOR
  readonly logOnly: boolean
}

export function recordHookDenial(denial: Omit<HookDenial, "at">): void {
  if (process.env["TSUKUMO_HOOK_DENIAL_RECORD"] === "off") {
    return
  }
  try {
    const directory = denialDirectory()
    const at = Temporal.Now.instant().toString()
    mkdirSync(directory, { recursive: true })
    appendFileSync(
      join(directory, `${at.slice(0, 7)}.jsonl`),
      `${JSON.stringify({ at, ...denial } satisfies HookDenial)}\n`,
    )
  } catch {
    // 記録できなくても hook の判定は変えない
  }
}

/** `since` 以降の記録。読めない行・置き場が無いときは含めない。 */
export function readHookDenials(since: Temporal.Instant): readonly RecordedHookDenial[] {
  try {
    const directory = denialDirectory()
    return readdirSync(directory)
      .filter((name) => name.endsWith(".jsonl"))
      .flatMap((name) => readFileSync(join(directory, name), "utf8").split("\n"))
      .flatMap(parseDenial)
      .filter((denial) => Temporal.Instant.compare(Temporal.Instant.from(denial.at), since) >= 0)
  } catch {
    return []
  }
}

function parseDenial(line: string): readonly RecordedHookDenial[] {
  try {
    const value: unknown = JSON.parse(line)
    if (
      typeof value === "object" &&
      value !== null &&
      "at" in value &&
      "hook" in value &&
      "rule" in value &&
      typeof value.at === "string" &&
      typeof value.hook === "string" &&
      typeof value.rule === "string"
    ) {
      Temporal.Instant.from(value.at)
      const actor =
        "actor" in value && (value.actor === "main" || value.actor === "subagent")
          ? value.actor
          : UNKNOWN_ACTOR
      const logOnly = "mode" in value && value.mode === "log-only"
      return [{ at: value.at, hook: value.hook, rule: value.rule, actor, logOnly }]
    }
  } catch {
    // 壊れた行は数えない
  }
  return []
}

function denialDirectory(): string {
  const commonDir = readGitCommonDirectory(process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd())
  return join(commonDir, DIRECTORY_NAME)
}
