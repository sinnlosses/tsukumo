// 診断ログ（`~/.tsukumo/diagnostic/<YYYY-MM-DD>.jsonl`）を、時刻の範囲と駆動の代で絞って時系列に並べる。
//
// 使い方:
//   node scripts/diagnostic.ts                                   # 今日のぶん
//   node scripts/diagnostic.ts --from <YYYY-MM-DD>T09:00 --to <YYYY-MM-DD>T10:30
//   node scripts/diagnostic.ts --from <YYYY-MM-DD> --generation 2  # その日の始まりから今日の終わりまでの、2代目だけ
//
// `--from` は含み、`--to` は含まない。どちらもローカル時刻の `YYYY-MM-DD` か `YYYY-MM-DDTHH:MM[:SS]`。
// 既定は `--from` が今日の始まり、`--to` が今日の終わり。

import process from "node:process"

import {
  isoWithOffset,
  localDateEpochRange,
  localDateTimeEpochMilliseconds,
  todayLocalDateKey,
} from "../src/server/adapter/local-time.ts"
import {
  createDiagnosticLog,
  diagnosticDir,
} from "../src/server/diagnostic/adapter/diagnostic-log.ts"
import type { DiagnosticEntry } from "../src/shared/diagnostic/diagnostic-record.ts"

const USAGE = `使い方:
  node scripts/diagnostic.ts [--from <時刻>] [--to <時刻>] [--generation <代>]
  時刻はローカルの YYYY-MM-DD か YYYY-MM-DDTHH:MM[:SS]`

type GenerationFilter =
  | { readonly kind: "all" }
  | { readonly kind: "one"; readonly generation: number }

const argv = process.argv.slice(2)
const today = localDateEpochRange(todayLocalDateKey())
const startAt = parseTimeOption(argv, "--from", today.startEpochMilliseconds)
const endAt = parseTimeOption(argv, "--to", today.endEpochMilliseconds)
const generation = parseGenerationOption(argv)
if (startAt === "invalid" || endAt === "invalid" || generation === "invalid" || startAt >= endAt) {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

const entries = createDiagnosticLog()
  .readRange({ startAt, endAt })
  .filter(
    (entry) =>
      generation.kind === "all" ||
      (entry.flow === "session-event" && entry.generation === generation.generation),
  )
if (entries.length === 0) {
  process.stdout.write(`${range(startAt, endAt)} の記録が無い（${diagnosticDir()} を見た）\n`)
  process.exit(0)
}

process.stdout.write(`${range(startAt, endAt)} の ${String(entries.length)} 件\n\n`)
for (const entry of entries) {
  process.stdout.write(`${line(entry)}\n`)
}

/** コマンドラインから時刻のオプションを読む。無ければ既定、崩れていれば `"invalid"`。 */
function parseTimeOption(
  args: readonly string[],
  name: string,
  fallback: number,
): number | "invalid" {
  const index = args.indexOf(name)
  if (index === -1) {
    return fallback
  }
  return localDateTimeEpochMilliseconds(args[index + 1] ?? "") ?? "invalid"
}

/** コマンドラインから `--generation <n>` を読む。無ければ絞らない、崩れていれば `"invalid"`。 */
function parseGenerationOption(args: readonly string[]): GenerationFilter | "invalid" {
  const index = args.indexOf("--generation")
  if (index === -1) {
    return { kind: "all" }
  }
  const parsed = Number(args[index + 1] ?? Number.NaN)
  return Number.isInteger(parsed) && parsed > 0 ? { kind: "one", generation: parsed } : "invalid"
}

function range(from: number, to: number): string {
  return `${isoWithOffset(from)}〜${isoWithOffset(to)}`
}

/** 1件を1行に。`session-event` は代・種類、`browser-error` は経路・`error.name`、`swallowed-failure` は場所・`error.name`・code。 */
function line(entry: DiagnosticEntry): string {
  const when = isoWithOffset(entry.at)
  if (entry.flow === "session-event") {
    return `${when}  ${entry.flow}  代${String(entry.generation)}  ${entry.kind}`
  }
  if (entry.flow === "browser-error") {
    return `${when}  ${entry.flow}  ${entry.route}  ${entry.errorName}`
  }
  if (entry.flow === "prompt-delay") {
    return `${when}  ${entry.flow}  書き込み${String(entry.writeMs)}ms  応答${String(entry.replyMs)}ms`
  }
  return `${when}  ${entry.flow}  ${entry.place.feature}/${entry.place.place}  ${entry.errorName}  ${entry.errorCode}`
}
