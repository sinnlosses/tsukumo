// 登録された hook ごとの拒否の回数を、期間を決めて数えて出す。
// 使い方: node scripts/hook-denial-tally.ts [--days N]（既定 30）
// 登録された hook は `.claude/settings.json` の hooks から呼ばれる `scripts/deny-*.ts`。

import { readFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { countBy, groupBy } from "remeda"

import { readHookDenials, type HookDenial } from "./lib/hook-denial-record.ts"

const DEFAULT_DAYS = 30

const HOOK_SCRIPT = /scripts\/(deny-[\w-]+)\.ts/g

const days = readDays(process.argv.slice(2))
const projectDir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd()
const since = Temporal.Now.instant().subtract({ hours: days * 24 })
const denials = readHookDenials(since)

process.stdout.write(formatTally(listRegisteredHooks(projectDir), denials, days))

function formatTally(
  registered: readonly string[],
  records: readonly HookDenial[],
  periodDays: number,
): string {
  const byHook = groupBy(records, (denial) => denial.hook)
  const unregistered = Object.keys(byHook).filter((hook) => !registered.includes(hook))
  const lines = [...registered, ...unregistered].flatMap((hook) => {
    const own = byHook[hook] ?? []
    const rules = Object.entries(countBy(own, (denial) => denial.rule)).map(
      ([rule, count]) => `  ${rule}: ${count}`,
    )
    const note = registered.includes(hook) ? "" : "（未登録）"
    return [`${hook}${note}: ${own.length}`, ...rules]
  })
  return `直近 ${periodDays} 日の拒否の回数\n${lines.join("\n")}\n`
}

/** `.claude/settings.json` から呼ばれる拒否の hook の名前。 */
function listRegisteredHooks(directory: string): readonly string[] {
  const text = readTextOrEmpty(join(directory, ".claude", "settings.json"))
  return [...new Set([...text.matchAll(HOOK_SCRIPT)].map((match) => match[1]))].filter(
    (name) => name !== undefined,
  )
}

function readDays(args: readonly string[]): number {
  const at = args.indexOf("--days")
  const value = at < 0 ? DEFAULT_DAYS : Number(args[at + 1])
  if (!Number.isInteger(value) || value <= 0) {
    process.stderr.write("--days には正の整数を渡す\n")
    process.exit(1)
  }
  return value
}

function readTextOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return ""
  }
}
