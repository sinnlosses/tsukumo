// 診断ログ（`~/.tsukumo/diagnostic/<YYYY-MM-DD>.jsonl`）を、時刻の範囲と駆動の代で絞って時系列に並べる。
// 迎えの書き込み（`welcome-writing`）があれば、並べたあとに書いたものごとの失敗率と所要も出す。
//
// 使い方:
//   node scripts/diagnostic.ts                                   # 今日のぶん
//   node scripts/diagnostic.ts --from <YYYY-MM-DD>T09:00 --to <YYYY-MM-DD>T10:30
//   node scripts/diagnostic.ts --from <YYYY-MM-DD> --generation 2  # その日の始まりから今日の終わりまでの、2代目だけ
//
// `--from` は含み、`--to` は含まない。どちらもローカル時刻の `YYYY-MM-DD` か `YYYY-MM-DDTHH:MM[:SS]`。
// 既定は `--from` が今日の始まり、`--to` が今日の終わり。

import process from "node:process"

import { countBy, groupBy, sortBy } from "remeda"

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
import type {
  WelcomeAttemptTrace,
  WelcomeWritingFootprint,
} from "../src/shared/diagnostic/welcome-writing.ts"

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
const welcomeWritings = entries.filter((entry) => entry.flow === "welcome-writing")
if (welcomeWritings.length > 0) {
  process.stdout.write(`\n迎えの書き込み（${String(welcomeWritings.length)} 回）\n`)
  for (const summary of welcomeWritingSummaries(welcomeWritings)) {
    process.stdout.write(`${summary}\n`)
  }
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

/** 書いたものごとに、回数・結果ごとの回数・失敗率・全体の所要の中央値と最大を1行にする。 */
function welcomeWritingSummaries(writings: readonly WelcomeWritingFootprint[]): readonly string[] {
  return Object.entries(groupBy(writings, (writing) => writing.target)).map(([target, group]) => {
    const durations = sortBy(group, (writing) => writing.durationMs).map(
      (writing) => writing.durationMs,
    )
    const outcomes = Object.entries(countBy(group, (writing) => writing.outcome))
      .map(([outcome, count]) => `${outcome} ${String(count)}`)
      .join(" / ")
    const failed = group.filter((writing) => writing.outcome !== "written").length
    const failureRate = ((failed / group.length) * 100).toFixed(1)
    const median = durations[Math.floor((durations.length - 1) / 2)] ?? 0
    const max = durations.at(-1) ?? 0
    return `  ${target}  ${String(group.length)} 回（${outcomes}）  失敗率 ${failureRate}%  所要 中央値 ${String(median)}ms 最大 ${String(max)}ms`
  })
}

/** 問い合わせ1回を `結果:ミリ秒` に。検査落ちの回は理由も添える。 */
function attemptLabel(attempt: WelcomeAttemptTrace): string {
  const result = attempt.result === "rejected" ? `rejected(${attempt.reason})` : attempt.result
  return `${result}:${String(attempt.ms)}ms`
}

/** 1件を1行に。`session-event` は代・種類、`browser-error` は経路・`error.name`、`swallowed-failure` は場所・`error.name`・code。 */
function line(entry: DiagnosticEntry): string {
  const when = isoWithOffset(entry.at)
  if (entry.flow === "welcome-writing") {
    return `${when}  ${entry.flow}  ${entry.target}  ${entry.outcome}  ${String(entry.durationMs)}ms  ${entry.attempts.map(attemptLabel).join(" ")}`
  }
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
