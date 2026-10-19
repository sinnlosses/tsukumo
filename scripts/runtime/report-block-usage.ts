// `report` の塊の使われ方（`~/.tsukumo/report-usage/<YYYY-MM-DD>.jsonl`）を集計し、
// 「塊の種類 × レポート数」「塊の欄 × レポート数」「modified のファイルがあるのに前後図も画像も無いレポート」
// 「段1の図を含むレポート」「画像を読んだのに image が無いレポート」「`figure` の種類 × レポート数」「`none` の理由 × レポート数」
// 「報告の種類 × レポート数」「種類ごとに必須の塊が無い割合」
// 「逃げ道の中の記法 × レポート数」「差し戻しの種類 × 回数」を割合つきで出す。
// 欄を記録する前の版（2）の行も読み、欄の表だけはそれを記録した版の行を分母にする（欄を足す前後で逃げ道を見比べるため）。
// `figure` を記録する前の版（5以前）の行は、`figure` の表では理由が `unrecorded` の `none` に数える。
// 強調の数・ラベルの無い辺の割合・節点数の分布は、それを記録した版7以降の行を分母にする。
// unverified のあるレポートのうち確かめ方のある割合は、版8以降の unverified のある行を分母にする。
// 報告の種類と必須の塊が無い割合は、版9以降の task の行を分母にする。
// 2行以下の表のあるレポートの割合は、版10以降の行を分母にする。
// 欄の表の `blockAside`（塊の傍注）は版12から、`beforeAfterRegion`（前後の画像の枠）は版15から記録している（それより前の行には出ない）。
// 札 × 節数と、札が許さない塊を使った節・組の数は、版13以降の行の節を分母にする。
// 引数の字数の分布と差し戻しの出し直しの割合は、版14以降の行を分母にする。
// 引き継ぎで出した呼び出しの数は、版16以降の行を分母にする。
//
// 使い方:
//   node scripts/runtime/report-block-usage.ts             # 直近28日
//   node scripts/runtime/report-block-usage.ts --days 14   # 直近14日

import process from "node:process"
import { parseArgs } from "node:util"

import { groupBy } from "remeda"
import { z } from "zod"

import { dateFileNames, readJsonLines } from "../../src/server/adapter/lib/jsonl.ts"
import { reportUsageDir } from "../../src/server/report/adapter/report-usage-log.ts"
import {
  ESCAPE_NOTATIONS,
  MARKDOWN_NOTATIONS,
} from "../../src/server/report/core/report-markdown-notation.ts"
import {
  REPORT_PROCEDURE_REJECTIONS,
  REPORT_TOOL_ERROR_REASON,
} from "../../src/server/report/core/report-review.ts"
import { REPORT_BLOCK_FIELDS } from "../../src/server/report/core/report-usage.ts"
import { REPORT_VIOLATION_KINDS } from "../../src/server/report/core/report-violation.ts"
import {
  REPORT_BLOCK_KINDS,
  REPORT_FIGURE_NONE_REASONS,
  reportFigureSchema,
} from "../../src/shared/report/report-block.ts"
import { REPORT_SHAPE_TAGS } from "../../src/shared/report/report-shape-tag.ts"
import { REPORT_GENRES } from "../../src/shared/report/report-task.ts"
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

/** 報告の種類の表の分母になる最初の版。 */
const GENRE_FORMAT_VERSION = 9

const genreRecordShape = {
  taskGenre: z.string(),
  taskOutcome: z.string(),
  hasFavor: z.boolean(),
  hasSourceReference: z.boolean(),
}

/** 2行以下の表の割合の分母になる最初の版。 */
const SHORT_TABLE_FORMAT_VERSION = 10

const shortTableRecordShape = {
  shortTable: z.boolean(),
}

/** `stats` の `series` / `better` を欄で数える最初の版（行の形は版10と同じ）。 */
const SERIES_FORMAT_VERSION = 11

/** 欄 `blockAside` を記録し始めた版。行の形は版10と同じ。 */
const BLOCK_ASIDE_FORMAT_VERSION = 12

/** 節の札と、札が許さない塊の数を記録し始めた版。 */
const SHAPE_TAG_FORMAT_VERSION = 13

const shapeTagRecordShape = {
  sectionShapeTags: z.array(z.string()),
  forbiddenShapeSectionCount: z.number(),
  forbiddenShapeBlocks: z.array(
    z.object({ shapeTag: z.string(), blockKind: z.string(), count: z.number() }),
  ),
}

/** 引数の字数を記録し始めた版。 */
const ARGUMENT_CHARS_FORMAT_VERSION = 14

/** 欄 `beforeAfterRegion` を記録し始めた版。行の形は版14と同じ。 */
const REGION_FORMAT_VERSION = 15

/** 差し戻しから引き継いだ欄の名前（`inheritedFields`）を記録し始めた版。 */
const INHERITED_FIELDS_FORMAT_VERSION = 16

const argumentCharsSchema = z.object({
  total: z.number(),
  fields: z.record(z.string(), z.number()),
})

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
      v: z.literal(HOW_TO_VERIFY_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(GENRE_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(SHORT_TABLE_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.union([z.literal(SERIES_FORMAT_VERSION), z.literal(BLOCK_ASIDE_FORMAT_VERSION)]),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(SHAPE_TAG_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
      ...shapeTagRecordShape,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.union([z.literal(ARGUMENT_CHARS_FORMAT_VERSION), z.literal(REGION_FORMAT_VERSION)]),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
      ...shapeTagRecordShape,
      argumentChars: argumentCharsSchema,
    })
    .and(figureFieldSchema),
  z
    .object({
      v: z.literal(INHERITED_FIELDS_FORMAT_VERSION),
      ...figureRecordShape,
      ...countRecordShape,
      ...howToVerifyRecordShape,
      ...genreRecordShape,
      ...shortTableRecordShape,
      ...shapeTagRecordShape,
      argumentChars: argumentCharsSchema,
      inheritedFields: z.array(z.string()),
    })
    .and(figureFieldSchema),
])
type UsageRecord = z.infer<typeof recordSchema>
type FieldRecord = Extract<UsageRecord, { readonly blockFields: readonly string[] }>
type VisualRecord = Extract<UsageRecord, { readonly hasModifiedFiles: boolean }>
type FigureRecord = Extract<UsageRecord, { readonly hasFigure: boolean }>
type CountRecord = Extract<UsageRecord, { readonly emphasisCount: number }>
type HowToVerifyRecord = Extract<UsageRecord, { readonly hasHowToVerify: boolean }>
type GenreRecord = Extract<UsageRecord, { readonly taskGenre: string }>
type ShortTableRecord = Extract<UsageRecord, { readonly shortTable: boolean }>
type ShapeTagRecord = Extract<UsageRecord, { readonly forbiddenShapeSectionCount: number }>
type ArgumentCharsRecord = Extract<UsageRecord, { readonly argumentChars: unknown }>

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
    z.literal(HOW_TO_VERIFY_FORMAT_VERSION),
    z.literal(GENRE_FORMAT_VERSION),
    z.literal(SHORT_TABLE_FORMAT_VERSION),
    z.literal(SERIES_FORMAT_VERSION),
    z.literal(BLOCK_ASIDE_FORMAT_VERSION),
    z.literal(SHAPE_TAG_FORMAT_VERSION),
    z.literal(ARGUMENT_CHARS_FORMAT_VERSION),
    z.literal(REGION_FORMAT_VERSION),
    z.literal(INHERITED_FIELDS_FORMAT_VERSION),
  ]),
  kind: z.literal("rejected"),
  reasons: z.array(z.string()),
  argumentChars: argumentCharsSchema.optional(),
  inheritedFields: z.array(z.string()).optional(),
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
const genreTaskRecords = records.filter(
  (record): record is GenreRecord =>
    record.v >= GENRE_FORMAT_VERSION && "taskGenre" in record && record.forTask,
)
const shortTableRecords = records.filter(
  (record): record is ShortTableRecord => record.v >= SHORT_TABLE_FORMAT_VERSION,
)
const shapeTagRecords = records.filter(
  (record): record is ShapeTagRecord => record.v >= SHAPE_TAG_FORMAT_VERSION,
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
process.stdout.write(genreSection(genreTaskRecords))
process.stdout.write("\n\n")
process.stdout.write(shortTableSection(shortTableRecords))
process.stdout.write("\n\n")
process.stdout.write(shapeTagSection(shapeTagRecords))
process.stdout.write("\n\n")
process.stdout.write(
  argumentCharsSection(
    records.filter(
      (record): record is ArgumentCharsRecord => record.v >= ARGUMENT_CHARS_FORMAT_VERSION,
    ),
    rejections.flatMap((rejection) =>
      rejection.argumentChars === undefined
        ? []
        : [{ argumentChars: rejection.argumentChars, inheritedFields: rejection.inheritedFields }],
    ),
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
    [...REPORT_PROCEDURE_REJECTIONS, REPORT_TOOL_ERROR_REASON, ...REPORT_VIOLATION_KINDS],
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

/** task の最終レポートの報告の種類の表と、種類ごとに必須の塊（判断の options・調べものの出典・中断の favor）が無い割合。 */
function genreSection(rows: readonly GenreRecord[]): string {
  if (rows.length === 0) {
    return "報告の種類と必須の塊が無い割合: 記録した行が無い"
  }
  const decision = rows.filter((record) => record.taskGenre === "decision")
  const research = rows.filter((record) => record.taskGenre === "research")
  const stopped = rows.filter((record) => record.taskOutcome === "stopped")
  return [
    table(
      `報告の種類 × レポート数（版9以降の task の最終レポート${String(rows.length)}件のうち）`,
      [...REPORT_GENRES, "unspecified"],
      rows,
      (record) => [record.taskGenre],
    ),
    [
      "種類ごとに必須の塊が無い割合（外す基準の対象ではない。差し戻しにしない）:",
      shareLine(
        "判断",
        "options 無し",
        decision,
        (record) => !record.blockKinds.includes("options"),
      ),
      shareLine(
        "調べもの",
        "出典も path:line も無し",
        research,
        (record) => !record.hasSourceReference,
      ),
      shareLine("中断", "favor 無し", stopped, (record) => !record.hasFavor),
    ].join("\n"),
  ].join("\n\n")
}

/** 行が2つ以下の表のあるレポートの割合。 */
function shortTableSection(rows: readonly ShortTableRecord[]): string {
  if (rows.length === 0) {
    return "2行以下の表のあるレポート: 記録した行が無い"
  }
  return [
    `2行以下の表のあるレポート（版10以降の${String(rows.length)}件のうち。外す基準の対象ではない。差し戻しにしない）:`,
    shareLine("全レポート", "2行以下の表あり", rows, (record) => record.shortTable),
    shareLine(
      "task の最終レポート",
      "2行以下の表あり",
      rows.filter((record) => record.forTask),
      (record) => record.shortTable,
    ),
  ].join("\n")
}

/** 札 × 節数と、札が許さない塊を使った節の数・許さない組 × 塊の数。分母は版13以降の行の節。 */
function shapeTagSection(rows: readonly ShapeTagRecord[]): string {
  if (rows.length === 0) {
    return "節の札: 記録した行が無い"
  }
  const tags = rows.flatMap((record) => record.sectionShapeTags)
  const taggedCount = tags.filter((tag) => tag !== "unspecified").length
  const forbiddenSections = rows.reduce(
    (total, record) => total + record.forbiddenShapeSectionCount,
    0,
  )
  const pairs = Object.entries(
    groupBy(
      rows.flatMap((record) => record.forbiddenShapeBlocks),
      (use) => `${use.shapeTag} × ${use.blockKind}`,
    ),
  ).map(([pair, uses]) => ({ pair, count: uses.reduce((total, use) => total + use.count, 0) }))
  const percentOf = (count: number, total: number): string =>
    (total === 0 ? 0 : (count / total) * 100).toFixed(1)
  return [
    `札 × 節数（版13以降の${String(rows.length)}件の節${String(tags.length)}個のうち。外す基準の対象ではない）:`,
    ...[...REPORT_SHAPE_TAGS, "unspecified"].map((tag) => {
      const count = tags.filter((written) => written === tag).length
      return `  ${tag.padEnd(26)} ${String(count).padStart(5)}  ${percentOf(count, tags.length).padStart(5)}%`
    }),
    "",
    `札が許さない塊を使った節（札を書いた節${String(taggedCount)}個のうち。差し戻しにしない）: ${String(forbiddenSections)}  ${percentOf(forbiddenSections, taggedCount)}%`,
    "札が許さない組 × 塊の数:",
    ...(pairs.length === 0
      ? ["  （無い）"]
      : pairs
          .toSorted((left, right) => right.count - left.count)
          .map(({ pair, count }) => `  ${pair.padEnd(26)} ${String(count).padStart(5)}`)),
  ].join("\n")
}

/**
 * 引数の字数（JSON にした字数。トークンの代わり）の分布。分母は版14以降の受け付けの行と、字数を持つ差し戻しの行。
 * 受け付けも差し戻しも、モデルが書いた生の引数の字数（差し戻しから引き継いだ欄は数えない）。
 * 形の検査で落ちた呼び出し（handler に届かなかったものと、組んだ値が落ちたもの）は、理由が `tool-error` の差し戻しの行に入る。
 * 引き継ぎで出した呼び出し（`inheritedFields` が空でない）の数は、版16以降の行を分母にする。
 */
function argumentCharsSection(
  accepted: readonly ArgumentCharsRecord[],
  rejected: readonly {
    readonly argumentChars: z.infer<typeof argumentCharsSchema>
    readonly inheritedFields: readonly string[] | undefined
  }[],
): string {
  if (accepted.length === 0) {
    return "引数の字数: 記録した行が無い"
  }
  const spreadLine = (label: string, values: readonly number[]): string =>
    `  ${label.padEnd(18)} ${String(values.length).padStart(5)}件  中央値 ${String(percentile(values, 0.5)).padStart(6)}  p90 ${String(percentile(values, 0.9)).padStart(6)}`
  const inheritanceLine = (
    label: string,
    inherited: readonly (readonly string[] | undefined)[],
  ): string => {
    const recorded = inherited.flatMap((fields) => (fields === undefined ? [] : [fields]))
    const count = recorded.filter((fields) => fields.length > 0).length
    const percent = (recorded.length === 0 ? 0 : (count / recorded.length) * 100).toFixed(1)
    return `  ${label.padEnd(18)} ${String(count).padStart(5)}件  版16以降の${String(recorded.length)}件のうち ${percent}%`
  }
  const acceptedMedian = percentile(
    accepted.map((record) => record.argumentChars.total),
    0.5,
  )
  const rejectedMedian = percentile(
    rejected.map((row) => row.argumentChars.total),
    0.5,
  )
  const fieldNames = [
    ...new Set(accepted.flatMap((record) => Object.keys(record.argumentChars.fields))),
  ].toSorted()
  return [
    `引数の字数（版14以降の受け付け${String(accepted.length)}件、差し戻し${String(rejected.length)}件。外す基準の対象ではない）:`,
    spreadLine(
      "受け付け 全体",
      accepted.map((record) => record.argumentChars.total),
    ),
    spreadLine(
      "差し戻し 全体",
      rejected.map((row) => row.argumentChars.total),
    ),
    acceptedMedian === 0 || rejected.length === 0
      ? "  差し戻しの出し直し: 差し戻しの字数の記録が無い"
      : `  差し戻し1回の字数（中央値）は受け付けの ${((rejectedMedian / acceptedMedian) * 100).toFixed(1)}%（直し1回ごとに書いた量）`,
    "引き継ぎで出した呼び出し（差し戻しから欄を1つ以上引き継いだもの）:",
    inheritanceLine(
      "受け付け",
      accepted.map((record) => ("inheritedFields" in record ? record.inheritedFields : undefined)),
    ),
    inheritanceLine(
      "差し戻し",
      rejected.map((row) => row.inheritedFields),
    ),
    "欄ごと（受け付けのうち、その欄を渡した行）:",
    ...fieldNames.map((name) =>
      spreadLine(
        name,
        accepted.flatMap((record) => {
          const chars = record.argumentChars.fields[name]
          return chars === undefined ? [] : [chars]
        }),
      ),
    ),
  ].join("\n")
}

/** 昇順にしたときの `ratio` 位置の値（最近順位法）。空なら 0。 */
function percentile(values: readonly number[], ratio: number): number {
  const sorted = values.toSorted((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0
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
