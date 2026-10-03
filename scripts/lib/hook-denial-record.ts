// hook が拒んだ回数の記録。時刻・hook の名前・規則のキー・誰の呼び出しかだけを残す。
// コマンドの全文・パス・会話の中身は入れない。
//
// 置き場は共有の git dir の `hook-denials/<年-月>.jsonl`（作業ツリーをまたいで1つ。コミットしない）。
// 書き込みの失敗は黙って握りつぶす。hook の終了コードと stderr を変えないため。

import { execFileSync } from "node:child_process"
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

const DIRECTORY_NAME = "hook-denials"

/** `git` は commit-msg フックで、メインか委譲先かが分からない。 */
export type DenialActor = "main" | "subagent" | "git"

export type HookDenial = {
  readonly at: string
  readonly hook: string
  readonly rule: string
  readonly actor: DenialActor
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
export function readHookDenials(since: Temporal.Instant): readonly HookDenial[] {
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

function parseDenial(line: string): readonly HookDenial[] {
  try {
    const value: unknown = JSON.parse(line)
    if (
      typeof value === "object" &&
      value !== null &&
      "at" in value &&
      "hook" in value &&
      "rule" in value &&
      "actor" in value &&
      typeof value.at === "string" &&
      typeof value.hook === "string" &&
      typeof value.rule === "string" &&
      (value.actor === "main" || value.actor === "subagent" || value.actor === "git")
    ) {
      Temporal.Instant.from(value.at)
      return [{ at: value.at, hook: value.hook, rule: value.rule, actor: value.actor }]
    }
  } catch {
    // 壊れた行は数えない
  }
  return []
}

function denialDirectory(): string {
  const commonDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    {
      cwd: process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  ).trim()
  return join(commonDir, DIRECTORY_NAME)
}
