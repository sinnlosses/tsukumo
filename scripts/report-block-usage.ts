// `report` の塊の使われ方（`~/.tsukumo/report-usage/<YYYY-MM-DD>.jsonl`）を集計し、
// 「塊の種類 × レポート数」「塊の欄 × レポート数」と「逃げ道の中の記法 × レポート数」を割合つきで出す。
// 欄を記録する前の版（2）の行も読み、欄の表だけはそれを記録した版の行を分母にする（欄を足す前後で逃げ道を見比べるため）。
//
// 使い方:
//   node scripts/report-block-usage.ts             # 直近28日
//   node scripts/report-block-usage.ts --days 14   # 直近14日

import process from "node:process"

import { z } from "zod"

import { dateFileNames, readJsonLines } from "../src/server/adapter/lib/jsonl.ts"
import { reportUsageDir } from "../src/server/report/adapter/report-usage-log.ts"
import { REPORT_BLOCK_FIELDS } from "../src/server/report/core/report-usage.ts"
import { ESCAPE_NOTATIONS, MARKDOWN_NOTATIONS } from "../src/server/report/core/report-violation.ts"
import { REPORT_BLOCK_KINDS } from "../src/shared/report/report-block.ts"
import { REPORT_USAGE_FORMAT_VERSION } from "../src/shared/report/report-usage-record.ts"

const USAGE = `使い方:
  node scripts/report-block-usage.ts             # 直近28日
  node scripts/report-block-usage.ts --days <日数>`

/** 欄（`blockFields`）を記録する前の版。 */
const FIELDLESS_FORMAT_VERSION = 2

const commonRecordShape = {
  blockKinds: z.array(z.string()),
  notations: z.array(z.string()),
  containedNotations: z.array(z.string()),
  escapeNotations: z.array(z.string()),
  unknownBlockCount: z.number(),
}

const recordSchema = z.discriminatedUnion("v", [
  z.object({ v: z.literal(FIELDLESS_FORMAT_VERSION), ...commonRecordShape }),
  z.object({
    v: z.literal(REPORT_USAGE_FORMAT_VERSION),
    blockFields: z.array(z.string()),
    ...commonRecordShape,
  }),
])
type UsageRecord = z.infer<typeof recordSchema>
type FieldRecord = Extract<UsageRecord, { readonly v: typeof REPORT_USAGE_FORMAT_VERSION }>

const days = parseDaysOption(process.argv.slice(2))
if (days === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

const records = readRecentRecords(reportUsageDir(), days)
if (records.length === 0) {
  process.stdout.write(`直近${String(days)}日の記録が無い（\`~/.tsukumo/report-usage/\` を見た）\n`)
  process.exit(0)
}

process.stdout.write(`直近${String(days)}日のレポート数: ${String(records.length)}\n\n`)
process.stdout.write(
  table("塊の種類 × レポート数", REPORT_BLOCK_KINDS, records, (record) => record.blockKinds),
)
process.stdout.write("\n\n")
const fieldRecords = records.filter(
  (record): record is FieldRecord => record.v === REPORT_USAGE_FORMAT_VERSION,
)
process.stdout.write(
  fieldRecords.length === 0
    ? "塊の欄 × レポート数: 欄を記録した行が無い"
    : table(
        `塊の欄 × レポート数（欄を記録した${String(fieldRecords.length)}件のうち）`,
        REPORT_BLOCK_FIELDS,
        fieldRecords,
        (record) => record.blockFields,
      ),
)
process.stdout.write("\n\n")
process.stdout.write(
  table("逃げ道の外の記法 × レポート数", MARKDOWN_NOTATIONS, records, (record) => record.notations),
)
process.stdout.write("\n\n")
process.stdout.write(
  table(
    "逃げ道の容れ物の中の記法 × レポート数",
    MARKDOWN_NOTATIONS,
    records,
    (record) => record.containedNotations,
  ),
)
process.stdout.write("\n\n")
process.stdout.write(
  table("塊の無い記法 × レポート数", ESCAPE_NOTATIONS, records, (record) => record.escapeNotations),
)
process.stdout.write("\n\n")
const unknownTotal = records.reduce((total, record) => total + record.unknownBlockCount, 0)
process.stdout.write(`知らない種類で境界で落とした塊の数（合計）: ${String(unknownTotal)}\n`)

/** コマンドラインから `--days <n>` を読む。無ければ既定の28日、崩れていれば `"invalid"`。 */
function parseDaysOption(argv: readonly string[]): number | "invalid" {
  const index = argv.indexOf("--days")
  if (index === -1) {
    return 28
  }
  const raw = argv[index + 1]
  const parsed = raw === undefined ? Number.NaN : Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : "invalid"
}

/** 今日を含む直近 `dayCount` 日の記録を、日付でファイルを絞って読む（壊れた行は読み飛ばす）。 */
function readRecentRecords(root: string, dayCount: number): readonly UsageRecord[] {
  const endDate = Temporal.Now.plainDateISO().toString()
  const startDate = Temporal.PlainDate.from(endDate)
    .subtract({ days: dayCount - 1 })
    .toString()
  return dateFileNames(root)
    .filter((name) => {
      const date = name.slice(0, 10)
      return date >= startDate && date <= endDate
    })
    .flatMap((name) => readValidRecords(`${root}/${name}`))
}

/** 壊れた JSON・欄が足りない行は読み飛ばす。 */
function readValidRecords(path: string): readonly UsageRecord[] {
  return readJsonLines(path).flatMap((raw) => {
    const record = recordSchema.safeParse(raw)
    return record.success ? [record.data] : []
  })
}

/** 名前ごとに「出たレポートの数」を数えた表。`knownNames` は0件でも出す（外す基準は0回を見る）。 */
function table<Row extends UsageRecord>(
  title: string,
  knownNames: readonly string[],
  usageRecords: readonly Row[],
  namesOf: (record: Row) => readonly string[],
): string {
  const names = [...new Set([...knownNames, ...usageRecords.flatMap(namesOf)])].toSorted()
  const rows = names.map((name) => {
    const count = usageRecords.filter((record) => namesOf(record).includes(name)).length
    const percent = ((count / usageRecords.length) * 100).toFixed(1)
    return `  ${name.padEnd(12)} ${String(count).padStart(5)}  ${percent.padStart(5)}%`
  })
  return [`${title}:`, ...rows].join("\n")
}
