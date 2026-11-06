// `report` の型の渡し方の切り替え（`json-schema` → `a2ui`）の前後で、差し戻しを並べる。
// 前は切り替えの前の7日の `json-schema` の行、後は期間内の `a2ui` の行。疑似セッションの行は除く。
//
// 使い方:
//   node scripts/runtime/compare-report-schema.ts --days 12   # 今日を含む直近12日を読む

import process from "node:process"

import { z } from "zod"

import { dateFileNamesBetween, readJsonLines } from "../../src/server/adapter/lib/jsonl.ts"
import { reportUsageDir } from "../../src/server/report/adapter/report-usage-log.ts"
import { parseDaysOption } from "../shared/days-option.ts"
import { schemaSwitchSection } from "./schema-switch-section.ts"

const BEFORE_FROM = "2026-10-21"
const BEFORE_TO = "2026-10-27"
const SWITCH_DATE = "2026-10-28"

const USAGE = "usage: node scripts/runtime/compare-report-schema.ts [--days <n>]"

const days = parseDaysOption(process.argv.slice(2))
if (days === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

const variantSchema = z.object({ reportSchema: z.string().optional() })
const variantOf = (raw: unknown): string | undefined => {
  const parsed = variantSchema.safeParse(raw)
  return parsed.success ? parsed.data.reportSchema : undefined
}

const root = reportUsageDir()
const readBetween = (from?: string, to?: string): readonly unknown[] =>
  dateFileNamesBetween(root, from, to).flatMap((name) => readJsonLines(`${root}/${name}`))

const today = Temporal.Now.plainDateISO()
const earliest = today.subtract({ days: days - 1 }).toString()
const before = readBetween(earliest > BEFORE_FROM ? earliest : BEFORE_FROM, BEFORE_TO).filter(
  (raw) => variantOf(raw) === "json-schema",
)
const after = readBetween(earliest > SWITCH_DATE ? earliest : SWITCH_DATE, undefined).filter(
  (raw) => variantOf(raw) === "a2ui",
)

process.stdout.write(
  `${schemaSwitchSection([
    { label: `切り替えの前（json-schema、${BEFORE_FROM}〜${BEFORE_TO}）`, rows: before },
    { label: `切り替えのあと（a2ui、${SWITCH_DATE}〜）`, rows: after },
  ])}\n`,
)
