// `report` の塊の使われ方（`~/.tsukumo/report-usage/<YYYY-MM-DD>.jsonl`）を集計し、
// 「塊の種類 × レポート数」「塊の欄 × レポート数」「modified のファイルがあるのに前後図も画像も無いレポート」
// 「段1の図を含むレポート」「画像を読んだのに image が無いレポート」「`figure` の種類 × レポート数」「`none` の理由 × レポート数」
// 「逃げ道の中の記法 × レポート数」「差し戻しの種類 × 回数」を割合つきで出す。
// 欄を記録する前の版（2）の行も読み、欄の表だけはそれを記録した版の行を分母にする（欄を足す前後で逃げ道を見比べるため）。
// `figure` を記録する前の版（5以前）の行は、`figure` の表では理由が `unrecorded` の `none` に数える。
// 強調の数・ラベルの無い辺の割合・節点数の分布は、それを記録した版7以降の行を分母にする。
// unverified のあるレポートのうち確かめ方のある割合は、版8以降の unverified のある行を分母にする。
//
// 使い方:
//   node scripts/runtime/report-block-usage.ts             # 直近28日
//   node scripts/runtime/report-block-usage.ts --days 14   # 直近14日

import process from "node:process"
import { parseArgs } from "node:util"

import { z } from "zod"

import { dateFileNames, readJsonLines } from "../../src/server/adapter/lib/jsonl.ts"
import { reportUsageDir } from "../../src/server/report/adapter/report-usage-log.ts"
import {
  ESCAPE_NOTATIONS,
  MARKDOWN_NOTATIONS,
} from "../../src/server/report/core/report-markdown-notation.ts"
import { REPORT_PROCEDURE_REJECTIONS } from "../../src/server/report/core/report-review.ts"
import { REPORT_BLOCK_FIELDS } from "../../src/server/report/core/report-usage.ts"
import { REPORT_VIOLATION_KINDS } from "../../src/server/report/core/report-violation.ts"
import {
  REPORT_BLOCK_KINDS,
  REPORT_FIGURE_NONE_REASONS,
  reportFigureSchema,
} from "../../src/shared/report/report-block.ts"
import { REPORT_USAGE_FORMAT_VERSION } from "../../src/shared/report/report-usage-record.ts"
import { positiveIntegerArgument } from "../shared/positive-integer-argument.ts"

const USAGE = `使い方:
  node scripts/runtime/report-block-usage.ts             # 直近28日
  node scripts/runtime/report-block-usage.ts --days <日数>`

/** 欄（`blockFields`）を記録する前の版。 */
const FIELDLESS_FORMAT_VERSION = 2

const commonRecordShape = {
  blockKinds: z.array(z.string()),
  notations: z.array(z.string()),
  containedNotations: z.array(z.string()),
  escapeNotations: z.array(z.string()),
  unknownBlockCount: z.number(),
}

/** 欄を記録し、前後図・画像の有無を記録する前の版。 */
const VISUALLESS_FORMAT_VERSION = 3

/** modified の表の分母になる最初の版（前後図・画像の有無を記録した）。 */
const MODIFIED_FORMAT_VERSION = 4

const visualRecordShape = {
  blockFields: z.array(z.string()),
  hasModifiedFiles: z.boolean(),
  hasBeforeAfterOrImage: z.boolean(),
  forTask: z.boolean(),
  ...commonRecordShape,
}

/** 段1の図の有無を記録し、`figure` を記録する前の版。 */
const FIGURE_FIELDLESS_FORMAT_VERSION = 5

const figureRecordShape = {
  hasFigure: z.boolean(),
  readImageWithoutImageBlock: z.boolean(),
  ...visualRecordShape,
}

const figureFieldSchema = z.union([
  z.object({ figureKind: z.literal("none"), noneReason: z.string() }),
  z.object({ figureKind: z.string() }),
])

/** `figure` を記録し、強調と graph の数を記録する前の版。 */
const COUNTLESS_FORMAT_VERSION = 6

/** 強調と graph の数の表の分母になる最初の版。 */
const COUNT_FORMAT_VERSION = 7

const countRecordShape = {
  emphasisCount: z.number(),
  graphEdgeCount: z.number(),
  graphUnlabeledEdgeCount: z.number(),
  graphNodeCount: z.number(),
}

/** 確かめ方の表の分母になる最初の版。 */
const HOW_TO_VERIFY_FORMAT_VERSION = 8

const howToVerifyRecordShape = {
  hasUnverifiedCheck: z.boolean(),
  hasHowToVerify: z.boolean(),
}

const recordSchema = z.union([
  z.object({ v: z.literal(FIELDLESS_FORMAT_VERSION), ...commonRecordShape }),
  z.object({
    v: z.literal(VISUALLESS_FORMAT_VERSION),
    blockFields: z.array(z.string()),
    ...commonRecordShape,
  }),
  z.object({ v: z.literal(MODIFIED_FORMAT_VERSION), ...visualRecordShape }),
  z.object({ v: z.literal(FIGURE_FIELDLESS_FORMAT_VERSION), ...figureRecordShape }),
  z.object({ v: z.literal(COUNTLESS_FORMAT_VERSION), ...figureRecordShape }).and(figureFieldSchema),
  z
    .object({
      v: z.literal(COUNT_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(REPORT_USAGE_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
    })
    .and(figureFieldSchema),
])
type UsageRecord = z.infer<typeof recordSchema>
type FieldRecord = Extract<UsageRecord, { readonly blockFields: readonly string[] }>
type VisualRecord = Extract<UsageRecord, { readonly hasModifiedFiles: boolean }>
type FigureRecord = Extract<UsageRecord, { readonly hasFigure: boolean }>
type CountRecord = Extract<UsageRecord, { readonly emphasisCount: number }>
type HowToVerifyRecord = Extract<UsageRecord, { readonly hasHowToVerify: boolean }>

/** `figure` の表に出す種類。0件でも出す。 */
const FIGURE_KINDS: readonly string[] = reportFigureSchema.options.map(
  (option) => option.shape.kind.value,
)

/** `figure` を記録する前の行の理由。 */
const UNRECORDED_REASON = "unrecorded"

/** 差し戻した呼び出しの行（`kind: "rejected"`）。受け付けの行には `kind` が無い。 */
const rejectionSchema = z.object({
  v: z.union([
    z.literal(VISUALLESS_FORMAT_VERSION),
    z.literal(MODIFIED_FORMAT_VERSION),
    z.literal(FIGURE_FIELDLESS_FORMAT_VERSION),
    z.literal(COUNTLESS_FORMAT_VERSION),
    z.literal(COUNT_FORMAT_VERSION),
    z.literal(REPORT_USAGE_FORMAT_VERSION),
  ]),
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
  (record): record is FieldRecord => record.v !== FIELDLESS_FORMAT_VERSION,
)
const visualRecords = records.filter(
  (record): record is VisualRecord => record.v >= MODIFIED_FORMAT_VERSION,
)
const figureRecords = records.filter(
  (record): record is FigureRecord => record.v >= FIGURE_FIELDLESS_FORMAT_VERSION,
)
const countRecords = records.filter(
  (record): record is CountRecord => record.v >= COUNT_FORMAT_VERSION,
)
const howToVerifyRecords = records.filter(
  (record): record is HowToVerifyRecord => record.v >= HOW_TO_VERIFY_FORMAT_VERSION,
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
process.stdout.write(modifiedWithoutVisualSection(visualRecords))
process.stdout.write("\n\n")
process.stdout.write(figureSection(figureRecords))
process.stdout.write("\n\n")
process.stdout.write(imageOversightSection(figureRecords))
process.stdout.write("\n\n")
process.stdout.write(figureFieldSection(records))
process.stdout.write("\n\n")
process.stdout.write(countSection(countRecords))
process.stdout.write("\n\n")
process.stdout.write(howToVerifySection(howToVerifyRecords))
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
  try {
    const { values } = parseArgs({
      args: [...argv],
      strict: true,
      options: { days: { type: "string" } },
    })
    const parsed = positiveIntegerArgument.default(28).safeParse(values.days)
    return parsed.success ? parsed.data : "invalid"
  } catch {
    return "invalid"
  }
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

/** modified のファイルがあるレポートのうち、前後図も画像も無かった数。外す基準の対象ではない。 */
function modifiedWithoutVisualSection(visualRecords: readonly VisualRecord[]): string {
  if (visualRecords.length === 0) {
    return "modified のファイルがあるのに前後図も画像も無いレポート: 記録した行が無い"
  }
  const line = (label: string, rows: readonly VisualRecord[]): string => {
    const modified = rows.filter((record) => record.hasModifiedFiles)
    const missing = modified.filter((record) => !record.hasBeforeAfterOrImage).length
    const percent = (modified.length === 0 ? 0 : (missing / modified.length) * 100).toFixed(1)
    return `  ${label.padEnd(16)} modified あり ${String(modified.length).padStart(5)}  うち前後図も画像も無し ${String(missing).padStart(5)}  ${percent.padStart(5)}%`
  }
  return [
    `modified のファイルがあるのに前後図も画像も無いレポート（前後図・画像の有無を記録した${String(visualRecords.length)}件のうち。外す基準の対象ではない）:`,
    line("全レポート", visualRecords),
    line(
      "task の最終レポート",
      visualRecords.filter((record) => record.forTask),
    ),
  ].join("\n")
}

/** 段1の図（image・mermaid・graph・svg。beforeAfter の側を含む）を含むレポートの割合。 */
function figureSection(rows: readonly FigureRecord[]): string {
  if (rows.length === 0) {
    return "段1の図を含むレポート: 記録した行が無い"
  }
  return [
    `段1の図（image・mermaid・graph・svg。beforeAfter の側を含む）を含むレポート（図の有無を記録した${String(rows.length)}件のうち。外す基準の対象ではない）:`,
    shareLine("全レポート", "図あり", rows, (record) => record.hasFigure),
    shareLine(
      "task の最終レポート",
      "図あり",
      rows.filter((record) => record.forTask),
      (record) => record.hasFigure,
    ),
  ].join("\n")
}

/** メインが画像のファイルを Read したのに image の塊が無かったレポートの割合。 */
function imageOversightSection(rows: readonly FigureRecord[]): string {
  if (rows.length === 0) {
    return "画像を読んだのに image が無いレポート: 記録した行が無い"
  }
  return [
    `画像のファイルを読んだのに image の塊が無いレポート（読んだかを記録した${String(rows.length)}件のうち。外す基準の対象ではない）:`,
    shareLine("全レポート", "見落とし", rows, (record) => record.readImageWithoutImageBlock),
    shareLine(
      "task の最終レポート",
      "見落とし",
      rows.filter((record) => record.forTask),
      (record) => record.readImageWithoutImageBlock,
    ),
  ].join("\n")
}

/** `figure` の種類と `none` の理由を、全レポートと task の最終レポートで1つずつ数えた表。 */
function figureFieldSection(rows: readonly UsageRecord[]): string {
  const taskRows = rows.filter((record) => "forTask" in record && record.forTask)
  const reasons = [...REPORT_FIGURE_NONE_REASONS, UNRECORDED_REASON]
  return [
    table("`figure` の種類 × レポート数（全レポート）", FIGURE_KINDS, rows, figureKindsOf),
    table(
      "`figure` の種類 × レポート数（task の最終レポート）",
      FIGURE_KINDS,
      taskRows,
      figureKindsOf,
    ),
    table("`none` の理由 × レポート数（全レポート）", reasons, rows, noneReasonsOf),
    table("`none` の理由 × レポート数（task の最終レポート）", reasons, taskRows, noneReasonsOf),
  ].join("\n\n")
}

function countSection(rows: readonly CountRecord[]): string {
  if (rows.length === 0) {
    return "強調の数・ラベルの無い辺の割合・節点数の分布: 記録した行が無い"
  }
  const bucketTable = (
    title: string,
    buckets: readonly string[],
    source: readonly CountRecord[],
    bucketOf: (record: CountRecord) => string,
    applies: (record: CountRecord) => boolean = () => true,
  ): string => {
    const target = source.filter(applies)
    const rows = buckets.map((bucket) => {
      const count = target.filter((record) => bucketOf(record) === bucket).length
      const percent = (target.length === 0 ? 0 : (count / target.length) * 100).toFixed(1)
      return `  ${bucket.padEnd(10)} ${String(count).padStart(5)}  ${percent.padStart(5)}%`
    })
    return [`${title}:`, ...rows].join("\n")
  }
  const emphasisBuckets = ["0", "1", "2", "3以上"]
  const emphasisBucket = (record: CountRecord): string =>
    record.emphasisCount >= 3 ? "3以上" : String(record.emphasisCount)
  const unlabeledBuckets = ["0%", "1〜49%", "50%以上"]
  const unlabeledBucket = (record: CountRecord): string => {
    const percent = (record.graphUnlabeledEdgeCount / record.graphEdgeCount) * 100
    if (record.graphEdgeCount === 0 || percent === 0) {
      return "0%"
    }
    return percent < 50 ? "1〜49%" : "50%以上"
  }
  const hasGraph = (record: CountRecord): boolean => record.graphNodeCount > 0
  const nodeBuckets = ["〜5", "6〜10", "11以上"]
  const nodeBucket = (record: CountRecord): string =>
    record.graphNodeCount <= 5 ? "〜5" : record.graphNodeCount <= 10 ? "6〜10" : "11以上"
  const scopes = [
    ["全レポート", rows],
    ["task の最終レポート", rows.filter((record) => record.forTask)],
  ] as const
  return scopes
    .flatMap(([scope, scoped]) => [
      bucketTable(
        `強調の数の分布 × レポート数（${scope}。版7以降の${String(scoped.length)}件のうち。外す基準の対象ではない）`,
        emphasisBuckets,
        scoped,
        emphasisBucket,
      ),
      bucketTable(
        `graph のあるレポートのラベルの無い辺の割合（${scope}。graph のあるものだけが分母。外す基準の対象ではない）`,
        unlabeledBuckets,
        scoped,
        unlabeledBucket,
        hasGraph,
      ),
      bucketTable(
        `graph の節点数の分布（${scope}。graph のあるものだけが分母。外す基準の対象ではない）`,
        nodeBuckets,
        scoped,
        nodeBucket,
        hasGraph,
      ),
    ])
    .join("\n\n")
}

/** `checks` に unverified の行があるレポートのうち、その全部に確かめ方があった割合。 */
function howToVerifySection(rows: readonly HowToVerifyRecord[]): string {
  const unverified = rows.filter((record) => record.hasUnverifiedCheck)
  if (unverified.length === 0) {
    return "unverified のあるレポートのうち確かめ方のある割合: 記録した行が無い"
  }
  return [
    `unverified のあるレポートのうち確かめ方のある割合（版8以降の${String(rows.length)}件のうち unverified のある${String(unverified.length)}件が分母。外す基準の対象ではない）:`,
    shareLine("全レポート", "確かめ方あり", unverified, (record) => record.hasHowToVerify),
    shareLine(
      "task の最終レポート",
      "確かめ方あり",
      unverified.filter((record) => record.forTask),
      (record) => record.hasHowToVerify,
    ),
  ].join("\n")
}

/** `figure` の種類。記録する前の版の行は `none`。 */
function figureKindsOf(record: UsageRecord): readonly string[] {
  return ["figureKind" in record ? record.figureKind : "none"]
}

/** `none` の理由。図を置いた行は無く、記録する前の版の行は `unrecorded`。 */
function noneReasonsOf(record: UsageRecord): readonly string[] {
  if (!("figureKind" in record)) {
    return [UNRECORDED_REASON]
  }
  return "noneReason" in record ? [record.noneReason] : []
}

function shareLine<Row>(
  label: string,
  what: string,
  rows: readonly Row[],
  matches: (row: Row) => boolean,
): string {
  const count = rows.filter(matches).length
  const percent = (rows.length === 0 ? 0 : (count / rows.length) * 100).toFixed(1)
  return `  ${label.padEnd(16)} ${what} ${String(count).padStart(5)}  ${String(rows.length).padStart(5)}件のうち ${percent.padStart(5)}%`
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
