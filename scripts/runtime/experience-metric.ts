// 体験の数（`~/.tsukumo/experience-metric/<YYYY-MM-DD>.jsonl`）を集計し、
// 依頼から結論まで・答え待ち・つまずきから立ち直るまでを、中央値と90パーセンタイルで出す。
// `--split` を付けると、その日の始まりを境目に前後を並べる。
//
// 使い方:
//   node scripts/runtime/experience-metric.ts                          # 直近28日
//   node scripts/runtime/experience-metric.ts --days 14                # 直近14日
//   node scripts/runtime/experience-metric.ts --split <YYYY-MM-DD>     # 直近28日を、その日の前と後に分ける

import process from "node:process"
import { parseArgs } from "node:util"

import { z } from "zod"

import { localDateEpochRange, todayLocalDateKey } from "../../src/server/adapter/local-time.ts"
import {
  createExperienceMetricLog,
  experienceMetricDir,
} from "../../src/server/experience-metric/adapter/experience-metric-log.ts"
import {
  type ExperienceSplit,
  type ExperienceSummary,
  type Spread,
  summarizeExperienceMetric,
} from "../../src/server/experience-metric/core/experience-metric-summary.ts"
import { positiveIntegerArgument } from "../shared/positive-integer-argument.ts"

const USAGE = `使い方:
  node scripts/runtime/experience-metric.ts [--days <日数>] [--split <YYYY-MM-DD>]`

const DEFAULT_DAYS = 28

const optionsSchema = z.object({
  days: positiveIntegerArgument.default(DEFAULT_DAYS),
  split: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

const RANGE_LABEL = {
  whole: "全体",
  before: "境目より前",
  after: "境目から後",
} satisfies Record<ExperienceSummary["range"], string>

const options = parseOptions(process.argv.slice(2))
if (options === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

const { days, split } = options
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

/** コマンドラインから `--days <n>` と `--split <YYYY-MM-DD>`（その日の始まりが境目）を読む。崩れていれば `"invalid"`。 */
function parseOptions(
  args: readonly string[],
): { readonly days: number; readonly split: ExperienceSplit } | "invalid" {
  try {
    const { values } = parseArgs({
      args: [...args],
      strict: true,
      options: { days: { type: "string" }, split: { type: "string" } },
    })
    const parsed = optionsSchema.safeParse(values)
    if (!parsed.success) {
      return "invalid"
    }
    const { days: dayCount, split: boundaryDate } = parsed.data
    return {
      days: dayCount,
      split:
        boundaryDate === undefined
          ? { kind: "whole" }
          : { kind: "around", boundary: localDateEpochRange(boundaryDate).startEpochMilliseconds },
    }
  } catch {
    return "invalid"
  }
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
