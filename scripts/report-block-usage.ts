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
import { REPORT_PROCEDURE_REJECTIONS } from "../src/server/report/core/report-review.ts"
import { REPORT_BLOCK_FIELDS } from "../src/server/report/core/report-usage.ts"
import {
  ESCAPE_NOTATIONS,
  MARKDOWN_NOTATIONS,
  REPORT_VIOLATION_KINDS,
} from "../src/server/report/core/report-violation.ts"
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

/** 差し戻した呼び出しの行（`kind: "rejected"`）。受け付けの行には `kind` が無い。 */
const rejectionSchema = z.object({
  v: z.literal(REPORT_USAGE_FORMAT_VERSION),
  kind: z.literal("rejected"),
  reasons: z.array(z.string()),
})
type RejectionRecord = z.infer<typeof rejectionSchema>

const days = parseDaysOption(process.argv.slice(2))
if (days === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

const { records, rejections } = readRecentRecords(reportUsageDir(), days)
if (records.length === 0 && rejections.length === 0) {
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
process.stdout.write(`知らない種類で境界で落とした塊の数（合計）: ${String(unknownTotal)}\n\n`)
process.stdout.write(
  table(
    `差し戻しの種類 × 回数（割合は \`report\` の呼び出し${String(records.length + rejections.length)}回〔受け付け${String(records.length)}＋差し戻し${String(rejections.length)}〕に対する）`,
    [...REPORT_PROCEDURE_REJECTIONS, ...REPORT_VIOLATION_KINDS],
    rejections,
    (record) => record.reasons,
    records.length + rejections.length,
  ),
)
process.stdout.write("\n")

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
function readRecentRecords(
  root: string,
  dayCount: number,
): { readonly records: readonly UsageRecord[]; readonly rejections: readonly RejectionRecord[] } {
  const endDate = Temporal.Now.plainDateISO().toString()
  const startDate = Temporal.PlainDate.from(endDate)
    .subtract({ days: dayCount - 1 })
    .toString()
  const raws = dateFileNames(root)
    .filter((name) => {
      const date = name.slice(0, 10)
      return date >= startDate && date <= endDate
    })
    .flatMap((name) => readJsonLines(`${root}/${name}`))
  return {
    records: raws.flatMap((raw) => {
      const record = recordSchema.safeParse(raw)
      return record.success ? [record.data] : []
    }),
    rejections: raws.flatMap((raw) => {
      const rejection = rejectionSchema.safeParse(raw)
      return rejection.success ? [rejection.data] : []
    }),
  }
}

/** 名前ごとに「出た行の数」を数えた表。`knownNames` は0件でも出す（外す基準は0回を見る）。`total` は割合の分母で、既定は行の数。 */
function table<Row>(
  title: string,
  knownNames: readonly string[],
  usageRecords: readonly Row[],
  namesOf: (record: Row) => readonly string[],
  total: number = usageRecords.length,
): string {
  const names = [...new Set([...knownNames, ...usageRecords.flatMap(namesOf)])].toSorted()
  const rows = names.map((name) => {
    const count = usageRecords.filter((record) => namesOf(record).includes(name)).length
    const percent = (total === 0 ? 0 : (count / total) * 100).toFixed(1)
    return `  ${name.padEnd(26)} ${String(count).padStart(5)}  ${percent.padStart(5)}%`
  })
  return [`${title}:`, ...rows].join("\n")
}
