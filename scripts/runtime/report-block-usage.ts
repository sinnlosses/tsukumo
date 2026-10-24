// `report` の塊の使われ方（`~/.tsukumo/report-usage/<YYYY-MM-DD>.jsonl`）を集計し、
// 「塊の種類 × レポート数」「塊の欄 × レポート数」「modified のファイルがあるのに前後図も画像も無いレポート」
// 「段1の図を含むレポート」「画像を読んだのに image が無いレポート」「`figure` の種類 × レポート数」「`none` の理由 × レポート数」
// 「報告の種類 × レポート数」「種類ごとに必須の塊が無い割合」
// 「逃げ道の中の記法 × レポート数」「差し戻しの種類 × 回数」を割合つきで出す。
// 読むのは `MIN_FORMAT_VERSION` 以降の行だけで、それより古い行は捨てる。
// 札 × 塊の種類の節数・`list` の style・`mermaid` の図種・駆動の数は、`sectionBlockKinds` を記録した行を分母にする。
// `keyFigures` の有無と、結論に数が並ぶのに無い割合は、その欄を記録した行を分母にする。
// 疑似セッションの行（`driver` が `fake`、`driver` の無い行は `sessionId` が `fake-session`）は、既定で全部の表から除く。
//
// 使い方:
//   node scripts/runtime/report-block-usage.ts                       # 直近28日
//   node scripts/runtime/report-block-usage.ts --days 14             # 直近14日
//   node scripts/runtime/report-block-usage.ts --include-fake        # 疑似セッションの行も数える

import process from "node:process"

import { groupBy } from "remeda"

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
import { REPORT_MERMAID_KINDS } from "../../src/shared/report/report-block-diagram.ts"
import { listBlockSchema } from "../../src/shared/report/report-block-prose.ts"
import {
  REPORT_BLOCK_KINDS,
  REPORT_FIGURE_NONE_REASONS,
  reportFigureSchema,
} from "../../src/shared/report/report-block.ts"
import { REPORT_SHAPE_TAGS } from "../../src/shared/report/report-shape-tag.ts"
import { REPORT_GENRES } from "../../src/shared/report/report-task.ts"
import { parseDaysOption } from "../shared/days-option.ts"
import {
  isFakeSessionRow,
  recordSchema,
  rejectionSchema,
  keyFiguresRowOf,
  type RejectionRecord,
  type SectionBlockRecord,
  type UsageRecord,
} from "./report-usage-row.ts"
import { keyFiguresSection, shareLine, shortTableSection } from "./report-usage-section.ts"

const USAGE = `使い方:
  node scripts/runtime/report-block-usage.ts             # 直近28日
  node scripts/runtime/report-block-usage.ts --days <日数>
  node scripts/runtime/report-block-usage.ts --include-fake  # 疑似セッションの行も数える`

const INCLUDE_FAKE_FLAG = "--include-fake"

/** `figure` の表に出す種類。0件でも出す。 */
const FIGURE_KINDS: readonly string[] = reportFigureSchema.options.map(
  (option) => option.shape.kind.value,
)

/** `figure` を記録する前の行の理由。 */
const UNRECORDED_REASON = "unrecorded"

const argv = process.argv.slice(2)
const includeFake = argv.includes(INCLUDE_FAKE_FLAG)
const days = parseDaysOption(argv.filter((argument) => argument !== INCLUDE_FAKE_FLAG))
if (days === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

const { records, rejections, fakeCount } = readRecentRecords(reportUsageDir(), days, includeFake)
if (records.length === 0 && rejections.length === 0) {
  process.stdout.write(`直近${String(days)}日の記録が無い（\`~/.tsukumo/report-usage/\` を見た）\n`)
  process.exit(0)
}

process.stdout.write(
  `直近${String(days)}日のレポート数: ${String(records.length)}（${
    includeFake
      ? "疑似セッションの行も数えた"
      : `疑似セッションの行 ${String(fakeCount)} 件は除いた。含めるなら ${INCLUDE_FAKE_FLAG}`
  }）\n\n`,
)
process.stdout.write(
  table("塊の種類 × レポート数", REPORT_BLOCK_KINDS, records, (record) => record.blockKinds),
)
process.stdout.write("\n\n")
process.stdout.write(
  table(
    `塊の欄 × レポート数（${String(records.length)}件のうち）`,
    REPORT_BLOCK_FIELDS,
    records,
    (record) => record.blockFields,
  ),
)
process.stdout.write("\n\n")
process.stdout.write(modifiedWithoutVisualSection(records))
process.stdout.write("\n\n")
process.stdout.write(figureSection(records))
process.stdout.write("\n\n")
process.stdout.write(imageOversightSection(records))
process.stdout.write("\n\n")
process.stdout.write(figureFieldSection(records))
process.stdout.write("\n\n")
process.stdout.write(countSection(records))
process.stdout.write("\n\n")
process.stdout.write(howToVerifySection(records))
process.stdout.write("\n\n")
process.stdout.write(genreSection(records.filter((record) => record.forTask)))
process.stdout.write("\n\n")
process.stdout.write(shortTableSection(records))
process.stdout.write("\n\n")
process.stdout.write(shapeTagSection(records))
process.stdout.write("\n\n")
const sectionBlockRecords = records.filter(
  (record): record is SectionBlockRecord => "sectionBlockKinds" in record,
)
process.stdout.write(sectionBlockSection(sectionBlockRecords))
process.stdout.write("\n\n")
process.stdout.write(keyFiguresSection(sectionBlockRecords.flatMap(keyFiguresRowOf)))
process.stdout.write("\n\n")
process.stdout.write(argumentCharsSection(records, rejections))
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

/** 今日を含む直近 `dayCount` 日の記録を、日付でファイルを絞って読む（壊れた行は読み飛ばす）。 */
function readRecentRecords(
  root: string,
  dayCount: number,
  withFake: boolean,
): {
  readonly records: readonly UsageRecord[]
  readonly rejections: readonly RejectionRecord[]
  readonly fakeCount: number
} {
  const endDate = Temporal.Now.plainDateISO().toString()
  const startDate = Temporal.PlainDate.from(endDate)
    .subtract({ days: dayCount - 1 })
    .toString()
  const allRaws = dateFileNames(root)
    .filter((name) => {
      const date = name.slice(0, 10)
      return date >= startDate && date <= endDate
    })
    .flatMap((name) => readJsonLines(`${root}/${name}`))
  const raws = withFake ? allRaws : allRaws.filter((raw) => !isFakeSessionRow(raw))
  return {
    fakeCount: allRaws.length - raws.length,
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

/** modified のファイルがあるレポートのうち、前後図も画像も無かった数。 */
function modifiedWithoutVisualSection(reports: readonly UsageRecord[]): string {
  if (reports.length === 0) {
    return "modified のファイルがあるのに前後図も画像も無いレポート: 記録した行が無い"
  }
  return [
    `modified のファイルがあるのに前後図も画像も無いレポート（前後図・画像の有無を記録した${String(reports.length)}件のうち。外す基準の対象ではない）:`,
    modifiedWithoutVisualLine("全レポート", reports),
    modifiedWithoutVisualLine(
      "task の最終レポート",
      reports.filter((record) => record.forTask),
    ),
  ].join("\n")
}

function modifiedWithoutVisualLine(label: string, rows: readonly UsageRecord[]): string {
  const modified = rows.filter((record) => record.hasModifiedFiles)
  const missing = modified.filter((record) => !record.hasBeforeAfterOrImage).length
  const percent = (modified.length === 0 ? 0 : (missing / modified.length) * 100).toFixed(1)
  return `  ${label.padEnd(16)} modified あり ${String(modified.length).padStart(5)}  うち前後図も画像も無し ${String(missing).padStart(5)}  ${percent.padStart(5)}%`
}

/** 段1の図（image・mermaid・graph・svg。beforeAfter の側を含む）を含むレポートの割合。 */
function figureSection(rows: readonly UsageRecord[]): string {
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
function imageOversightSection(rows: readonly UsageRecord[]): string {
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
  const taskRows = rows.filter((record) => record.forTask)
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

function countSection(rows: readonly UsageRecord[]): string {
  if (rows.length === 0) {
    return "強調の数・ラベルの無い辺の割合・節点数の分布: 記録した行が無い"
  }
  const emphasisBuckets = ["0", "1", "2", "3以上"]
  const unlabeledBuckets = ["0%", "1〜49%", "50%以上"]
  const nodeBuckets = ["〜5", "6〜10", "11以上"]
  const scopes = [
    ["全レポート", rows],
    ["task の最終レポート", rows.filter((record) => record.forTask)],
  ] as const
  return scopes
    .flatMap(([scope, scoped]) => [
      bucketTable(
        `強調の数の分布 × レポート数（${scope}。${String(scoped.length)}件のうち。外す基準の対象ではない）`,
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

function bucketTable(
  title: string,
  buckets: readonly string[],
  source: readonly UsageRecord[],
  bucketOf: (record: UsageRecord) => string,
  applies: (record: UsageRecord) => boolean = () => true,
): string {
  const target = source.filter(applies)
  const bucketLines = buckets.map((bucket) => {
    const count = target.filter((record) => bucketOf(record) === bucket).length
    const percent = (target.length === 0 ? 0 : (count / target.length) * 100).toFixed(1)
    return `  ${bucket.padEnd(10)} ${String(count).padStart(5)}  ${percent.padStart(5)}%`
  })
  return [`${title}:`, ...bucketLines].join("\n")
}

function emphasisBucket(record: UsageRecord): string {
  return record.emphasisCount >= 3 ? "3以上" : String(record.emphasisCount)
}

function unlabeledBucket(record: UsageRecord): string {
  const percent = (record.graphUnlabeledEdgeCount / record.graphEdgeCount) * 100
  if (record.graphEdgeCount === 0 || percent === 0) {
    return "0%"
  }
  return percent < 50 ? "1〜49%" : "50%以上"
}

function hasGraph(record: UsageRecord): boolean {
  return record.graphNodeCount > 0
}

function nodeBucket(record: UsageRecord): string {
  return record.graphNodeCount <= 5 ? "〜5" : record.graphNodeCount <= 10 ? "6〜10" : "11以上"
}

/** `checks` に unverified の行があるレポートのうち、その全部に確かめ方があった割合。 */
function howToVerifySection(rows: readonly UsageRecord[]): string {
  const unverified = rows.filter((record) => record.hasUnverifiedCheck)
  if (unverified.length === 0) {
    return "unverified のあるレポートのうち確かめ方のある割合: 記録した行が無い"
  }
  return [
    `unverified のあるレポートのうち確かめ方のある割合（${String(rows.length)}件のうち unverified のある${String(unverified.length)}件が分母。外す基準の対象ではない）:`,
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
function genreSection(rows: readonly UsageRecord[]): string {
  if (rows.length === 0) {
    return "報告の種類と必須の塊が無い割合: 記録した行が無い"
  }
  const decision = rows.filter((record) => record.taskGenre === "decision")
  const research = rows.filter((record) => record.taskGenre === "research")
  const stopped = rows.filter((record) => record.taskOutcome === "stopped")
  return [
    table(
      `報告の種類 × レポート数（task の最終レポート${String(rows.length)}件のうち）`,
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

/** 札 × 節数と、札が許さない塊を使った節の数・許さない組 × 塊の数。分母は行の節。 */
function shapeTagSection(rows: readonly UsageRecord[]): string {
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
  return [
    `札 × 節数（${String(rows.length)}件の節${String(tags.length)}個のうち。外す基準の対象ではない）:`,
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
 * 札 × 節に出た塊の種類の節数、`list` の style・`mermaid` の図種 × レポート数、駆動 × レポート数。分母は `sectionBlockKinds` を記録した行。
 * 節の数は `sectionShapeTags` と `sectionBlockKinds` の同じ位置を対にして数える。
 */
function sectionBlockSection(rows: readonly SectionBlockRecord[]): string {
  if (rows.length === 0) {
    return "札 × 節に出た塊の種類・list の style・mermaid の図種・駆動: 記録した行が無い"
  }
  const sections = rows.flatMap((record) =>
    record.sectionShapeTags.map((shapeTag, index) => ({
      shapeTag,
      blockKinds: record.sectionBlockKinds[index] ?? [],
    })),
  )
  const tagLines = [...REPORT_SHAPE_TAGS, "unspecified"].map((tag) => {
    const own = sections.filter((section) => section.shapeTag === tag)
    const kindCounts = Object.entries(
      groupBy(
        own.flatMap((section) => section.blockKinds),
        (kind) => kind,
      ),
    )
      .map(([kind, uses]) => ({ kind, count: uses.length }))
      .toSorted((left, right) => right.count - left.count)
      .map(({ kind, count }) => `${kind} ${String(count)}`)
    return `  ${tag.padEnd(26)} ${String(own.length).padStart(5)}節  ${kindCounts.join("・")}`
  })
  return [
    `札 × 節に出た塊の種類の節数（${String(rows.length)}件の節${String(sections.length)}個。外す基準の対象ではない）:`,
    ...tagLines,
    "",
    table(
      `\`list\` の style × レポート数（${String(rows.length)}件のうち）`,
      listBlockSchema.shape.style.options,
      rows,
      (record) => record.listStyles,
    ),
    "",
    table(
      `\`mermaid\` の図種 × レポート数（${String(rows.length)}件のうち）`,
      REPORT_MERMAID_KINDS,
      rows,
      (record) => record.mermaidKinds,
    ),
    "",
    table(
      `駆動 × レポート数（${String(rows.length)}件のうち）`,
      ["sdk", "fake"],
      rows,
      (record) => [record.driver],
    ),
  ].join("\n")
}

function percentOf(count: number, total: number): string {
  return (total === 0 ? 0 : (count / total) * 100).toFixed(1)
}

/**
 * 引数の字数（JSON にした字数。トークンの代わり）の分布。分母は受け付けの行と差し戻しの行。
 * 受け付けも差し戻しも、モデルが書いた生の引数の字数（差し戻しから引き継いだ欄は数えない）。
 * 形の検査で落ちた呼び出し（handler に届かなかったものと、組んだ値が落ちたもの）は、理由が `tool-error` の差し戻しの行に入る。
 */
function argumentCharsSection(
  accepted: readonly UsageRecord[],
  rejected: readonly RejectionRecord[],
): string {
  if (accepted.length === 0) {
    return "引数の字数: 記録した行が無い"
  }
  const spreadLine = (label: string, values: readonly number[]): string =>
    `  ${label.padEnd(18)} ${String(values.length).padStart(5)}件  中央値 ${String(percentile(values, 0.5)).padStart(6)}  p90 ${String(percentile(values, 0.9)).padStart(6)}`
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
    `引数の字数（受け付け${String(accepted.length)}件、差し戻し${String(rejected.length)}件。外す基準の対象ではない）:`,
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
      accepted.map((record) => record.inheritedFields),
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

function inheritanceLine(label: string, inherited: readonly (readonly string[])[]): string {
  const count = inherited.filter((fields) => fields.length > 0).length
  const percent = (inherited.length === 0 ? 0 : (count / inherited.length) * 100).toFixed(1)
  return `  ${label.padEnd(18)} ${String(count).padStart(5)}件  ${String(inherited.length)}件のうち ${percent}%`
}

/** 昇順にしたときの `ratio` 位置の値（最近順位法）。空なら 0。 */
function percentile(values: readonly number[], ratio: number): number {
  const sorted = values.toSorted((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}

function figureKindsOf(record: UsageRecord): readonly string[] {
  return [record.figureKind]
}

/** `none` の理由。図を置いた行は無い。 */
function noneReasonsOf(record: UsageRecord): readonly string[] {
  return "noneReason" in record ? [record.noneReason] : []
}

/** 名前ごとに「出た行の数」を数えた表。`knownNames` は0件でも出す。`total` は割合の分母で、既定は行の数。 */
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
