// 登録された hook ごとの拒否の回数を、期間を決めて数えて出す。
// 使い方: node scripts/hook/hook-denial-tally.ts [--days N]（既定 30）
// 登録された hook は `.claude/settings.json` の hooks から呼ばれる Bash の入口（束ねた判定の名前に展開する）と
// 単独の `deny-*` の入口と、hook ではなく実行する側が拒んで同じ置き場に記録する門（`RUN_SIDE_GATES`）。
// 記録にあって登録に無い名前（tw の関門など）は「（未登録）」を付けて続ける。
// 規則のキーごとに、呼び手（main / subagent / 呼び手の欄が無い旧い行の不明）の件数を添える。

import { readFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { countBy, groupBy } from "remeda"

import { BASH_GUARD_HOOKS } from "./lib/bash-denial.ts"
import {
  readHookDenials,
  UNKNOWN_ACTOR,
  type RecordedHookDenial,
} from "./lib/hook-denial-record.ts"
import { readDays } from "./lib/read-period.ts"

const DEFAULT_DAYS = 30

const HOOK_SCRIPT = /scripts\/hook\/(bash-guard|deny-[\w-]+)\.ts/g

/** E2E の入口が上限で拒んだときの記録の名前。 */
const RUN_SIDE_GATES = ["e2e-run-limit"] as const

const ACTOR_ORDER = ["main", "subagent", UNKNOWN_ACTOR] as const

const days = readDays(process.argv.slice(2), DEFAULT_DAYS)
const projectDir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd()
const since = Temporal.Now.instant().subtract({ hours: days * 24 })
const denials = readHookDenials(since).filter((denial) => !denial.logOnly)

process.stdout.write(formatTally(listRegisteredHooks(projectDir), denials, days))

function formatTally(
  registered: readonly string[],
  records: readonly RecordedHookDenial[],
  periodDays: number,
): string {
  const byHook = groupBy(records, (denial) => denial.hook)
  const unregistered = Object.keys(byHook).filter((hook) => !registered.includes(hook))
  const lines = [...registered, ...unregistered].flatMap((hook) => {
    const own = byHook[hook] ?? []
    const rules = Object.entries(groupBy(own, (denial) => denial.rule)).map(([rule, group]) => {
      const actors = countBy(group, (denial) => denial.actor)
      const breakdown = ACTOR_ORDER.map((actor) => `${actor} ${actors[actor] ?? 0}`).join(" / ")
      return `  ${rule}: ${group.length}（${breakdown}）`
    })
    const note = registered.includes(hook) ? "" : "（未登録）"
    return [`${hook}${note}: ${own.length}`, ...rules]
  })
  return `直近 ${periodDays} 日の拒否の回数\n${lines.join("\n")}\n`
}

/** `.claude/settings.json` から呼ばれる拒否の hook の名前と、実行する側の門の名前。 */
function listRegisteredHooks(directory: string): readonly string[] {
  const text = readTextOrEmpty(join(directory, ".claude", "settings.json"))
  const scripts = [...new Set([...text.matchAll(HOOK_SCRIPT)].map((match) => match[1]))].filter(
    (name) => name !== undefined,
  )
  const hooks = scripts.flatMap((name) => (name === "bash-guard" ? BASH_GUARD_HOOKS : [name]))
  return [...new Set(hooks), ...RUN_SIDE_GATES]
}

function readTextOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return ""
  }
}
