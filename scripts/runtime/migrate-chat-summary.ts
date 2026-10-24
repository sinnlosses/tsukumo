// あらすじの旧い形を新しい形へ移し、取り残したファイルを消す。人が1回だけ打つ。
// 本文・話題・エピソードの文面は出さない（パック名・件数・長さ・日付だけ）。
// tsukumo を止めてから、--dry-run で見たあとに打つ。
//
// 使い方:
//   node scripts/runtime/migrate-chat-summary.ts [--dry-run]           # 旧い形を新しい形へ移す
//   node scripts/runtime/migrate-chat-summary.ts --prune [--dry-run]   # 取り残したファイルを消す

import process from "node:process"
import { parseArgs } from "node:util"

import { tsukumoHomeDir } from "../../src/server/adapter/tsukumo-home.ts"
import {
  describeMigration,
  describePrune,
  migrateChatSummaries,
  migrationPlace,
  pruneLeftovers,
} from "../shared/chat-summary-migration.ts"

const USAGE = `使い方:
  node scripts/runtime/migrate-chat-summary.ts [--dry-run]           # 旧い形を新しい形へ移す
  node scripts/runtime/migrate-chat-summary.ts --prune [--dry-run]   # 取り残したファイルを消す`

const options = readOptions(process.argv.slice(2))
if (options === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

const home = tsukumoHomeDir()
const place = migrationPlace(home)
const lines = options.prune
  ? describePrune(pruneLeftovers(place, home, options.dryRun))
  : describeMigration(migrateChatSummaries(place, options.dryRun))
process.stdout.write(`${options.dryRun ? "[dry-run] " : ""}${home}\n`)
process.stdout.write(lines.length === 0 ? "対象なし\n" : `${lines.join("\n")}\n`)

function readOptions(
  args: readonly string[],
): { readonly dryRun: boolean; readonly prune: boolean } | "invalid" {
  try {
    const { values } = parseArgs({
      args: [...args],
      strict: true,
      options: { "dry-run": { type: "boolean" }, prune: { type: "boolean" } },
    })
    return { dryRun: values["dry-run"] === true, prune: values.prune === true }
  } catch {
    return "invalid"
  }
}
