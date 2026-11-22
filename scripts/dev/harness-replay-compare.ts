// タスクの再試の結果（harness-replay の `--out` の JSON）を版ごとに複数受け、
// 同じ版の中で pass^k が揺れた件に印を付け、揺れた件を外して版どうしの通った件数を比べる入口。claude は起こさない。
//
// 使い方:
//   pnpm run harness-replay-compare -- --baseline <a.json,…> --candidate <b.json,…>

import { readFileSync } from "node:fs"
import process from "node:process"

import {
  compareReplayVersions,
  formatReplayComparison,
  parseReplayResult,
  type ReplayResult,
} from "../shared/replay-flakiness.ts"
import { parseReplayCompareOptions } from "../shared/replay-option.ts"

const options = parseReplayCompareOptions(process.argv.slice(2))
if (options === "invalid") {
  process.stderr.write(
    "使い方: pnpm run harness-replay-compare -- --baseline <path,…> --candidate <path,…>\n",
  )
  process.exit(2)
}

const comparison = compareReplayVersions(
  options.baseline.map(readResult),
  options.candidate.map(readResult),
)
for (const line of formatReplayComparison(comparison)) {
  process.stdout.write(`${line}\n`)
}

function readResult(path: string): ReplayResult {
  const result = parseResultFile(path)
  if (result === "invalid") {
    process.stderr.write(`再試の結果として読めません: ${path}\n`)
    return process.exit(2)
  }
  return result
}

function parseResultFile(path: string): ReplayResult | "invalid" {
  try {
    return parseReplayResult(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return "invalid"
  }
}
