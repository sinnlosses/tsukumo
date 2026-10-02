// 体験の数（`~/.tsukumo/experience-metric/<YYYY-MM-DD>.jsonl`）を集計し、
// 依頼から結論まで・答え待ち・つまずきから立ち直るまでを、中央値と90パーセンタイルで出す。
// `--split` を付けると、その日の始まりを境目に前後を並べる。
//
// 使い方:
//   node scripts/experience-metric.ts                          # 直近28日
//   node scripts/experience-metric.ts --days 14                # 直近14日
//   node scripts/experience-metric.ts --split <YYYY-MM-DD>     # 直近28日を、その日の前と後に分ける

import process from "node:process"

import { localDateEpochRange, todayLocalDateKey } from "../src/server/adapter/local-time.ts"
import {
  createExperienceMetricLog,
  experienceMetricDir,
} from "../src/server/experience-metric/adapter/experience-metric-log.ts"
import {
  type ExperienceSplit,
  type ExperienceSummary,
  type Spread,
  summarizeExperienceMetric,
} from "../src/server/experience-metric/core/experience-metric-summary.ts"

const USAGE = `使い方:
  node scripts/experience-metric.ts [--days <日数>] [--split <YYYY-MM-DD>]`

const DEFAULT_DAYS = 28

const RANGE_LABEL = {
  whole: "全体",
  before: "境目より前",
  after: "境目から後",
} satisfies Record<ExperienceSummary["range"], string>

const argv = process.argv.slice(2)
const days = parseDaysOption(argv)
const split = parseSplitOption(argv)
if (days === "invalid" || split === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

const endDate = todayLocalDateKey()
const startDate = Temporal.PlainDate.from(endDate)
  .subtract({ days: days - 1 })
  .toString()
const entries = createExperienceMetricLog().readRange({ startDate, endDate })
if (entries.length === 0) {
  process.stdout.write(`直近${String(days)}日の記録が無い（${experienceMetricDir()} を見た）\n`)
  process.exit(0)
}

process.stdout.write(`直近${String(days)}日（${startDate}〜${endDate}）の体験の数\n\n`)
process.stdout.write(table(summarizeExperienceMetric(entries, split)))

/** コマンドラインから `--days <n>` を読む。無ければ既定、崩れていれば `"invalid"`。 */
function parseDaysOption(args: readonly string[]): number | "invalid" {
  const index = args.indexOf("--days")
  if (index === -1) {
    return DEFAULT_DAYS
  }
  const parsed = Number(args[index + 1] ?? Number.NaN)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : "invalid"
}

/** コマンドラインから `--split <YYYY-MM-DD>` を読み、その日の始まりを境目にする。 */
function parseSplitOption(args: readonly string[]): ExperienceSplit | "invalid" {
  const index = args.indexOf("--split")
  if (index === -1) {
    return { kind: "whole" }
  }
  const raw = args[index + 1] ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "invalid"
  }
  return { kind: "around", boundary: localDateEpochRange(raw).startEpochMilliseconds }
}

/** 期間ごとの列を並べた表（Markdown）。 */
function table(summaries: readonly ExperienceSummary[]): string {
  const rows: readonly (readonly [string, (summary: ExperienceSummary) => string])[] = [
    ["閉じた依頼（deliver / stumble）", (s) => `${String(s.delivered)} / ${String(s.stumbled)}`],
    ["依頼から結論まで（中央値 / p90）", (s) => seconds(s.untilConclusionMs)],
    ["答え待ちのあった依頼", (s) => String(s.asked)],
    ["答え待ち（中央値 / p90）", (s) => seconds(s.askingMs)],
    ["答え待ちの合計", (s) => `${formatSeconds(s.askingTotalMs)}秒`],
    ["つまずきからの立ち直り", (s) => String(s.recoveries)],
    ["立ち直るまでの手数（中央値 / p90）", (s) => count(s.hands)],
    ["立ち直るまで（中央値 / p90）", (s) => seconds(s.untilRecoveryMs)],
  ]
  const header = `| 数 | ${summaries.map((s) => RANGE_LABEL[s.range]).join(" | ")} |`
  const rule = `| --- | ${summaries.map(() => "---").join(" | ")} |`
  const body = rows.map(
    ([label, cell]) => `| ${label} | ${summaries.map((s) => cell(s)).join(" | ")} |`,
  )
  return `${[header, rule, ...body].join("\n")}\n`
}

function seconds(spread: Spread): string {
  return spread.kind === "empty"
    ? "—"
    : `${formatSeconds(spread.median)}秒 / ${formatSeconds(spread.p90)}秒`
}

function count(spread: Spread): string {
  return spread.kind === "empty" ? "—" : `${String(spread.median)} / ${String(spread.p90)}`
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1)
}
