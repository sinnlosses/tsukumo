// 使用量の記録（context-usage・experience-metric・report-usage）に残った
// 疑似セッション（`sessionId` が `fake-session`）の行を取り除く、1回限りの掃除。
// 件数だけを出し、行の中身は読み出さず出さない。
//
// 使い方:
//   node scripts/runtime/purge-fake-usage.ts --dry-run   # 消す件数だけ出す
//   node scripts/runtime/purge-fake-usage.ts             # 消す

import process from "node:process"
import { parseArgs } from "node:util"

import { contextUsageDir } from "../../src/server/context-usage/adapter/context-usage-log.ts"
import { experienceMetricDir } from "../../src/server/experience-metric/adapter/experience-metric-log.ts"
import { reportUsageDir } from "../../src/server/report/adapter/report-usage-log.ts"
import { purgeFakeRows } from "../shared/fake-usage-purge.ts"

const USAGE = `使い方:
  node scripts/runtime/purge-fake-usage.ts [--dry-run]`

const dryRun = parseDryRun(process.argv.slice(2))
if (dryRun === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

for (const dir of [contextUsageDir(), experienceMetricDir(), reportUsageDir()]) {
  const { removed, kept } = purgeFakeRows(dir, dryRun)
  const verb = dryRun ? "消す" : "消した"
  process.stdout.write(`${dir}: ${verb} ${String(removed)} 行、残す ${String(kept)} 行\n`)
}

function parseDryRun(args: readonly string[]): boolean | "invalid" {
  try {
    const { values } = parseArgs({
      args: [...args],
      strict: true,
      options: { "dry-run": { type: "boolean" } },
    })
    return values["dry-run"] === true
  } catch {
    return "invalid"
  }
}
