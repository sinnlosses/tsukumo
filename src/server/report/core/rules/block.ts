// 塊の検査の家族。違反の型・検出を持つ。

import { unique } from "remeda"

import { markFitsLines, sourceLineCount } from "../../../../shared/report/code-mark.ts"
import { isEmphasisRow } from "../../../../shared/report/report-block-comparison.ts"
import {
  MAX_EMPHASIS_ROWS,
  MAX_LIST_ITEMS,
  MAX_PLAIN_CODE_LINES,
  MAX_TABLE_ROWS,
} from "../../../../shared/report/report-limit.ts"
import {
  drawnLeaves,
  type ReportOutline,
  type ReportOutlineLeaf,
  reportFigureOf,
  sectionLeaves,
} from "../../../../shared/report/report-outline.ts"
import type { CardsFault } from "./block/cards-fault.ts"
import { codeBlockMatchesFile } from "./block/code-match.ts"
import {
  badCardsIn,
  crowdedNoteCount,
  drawsShape,
  hasBadChartAnnotation,
  hasBadChartTones,
  hasBadRegion,
  hasShortSeries,
  hasUnknownEmphasis,
  isBadHeat,
  isBadRowDepth,
  isBadChartGrid,
  isBestColumnOutOfRange,
  isEmphasisColumnOutOfRange,
  isRaggedChart,
  isRaggedTable,
  isSentenceTable,
  isVerdictOrdered,
  nestedFoldCount,
  noteCount,
} from "./block/shape.ts"
import type { ReportDraft } from "./draft.ts"

export type BlockViolation =
  /** `note` の塊が3つ以上ある（「1つのレポートに1〜2個まで」）。 */
  | { readonly kind: "too-many-notes"; readonly count: number }
  /**
   * `note` が隣り合う、または見出しのある節の先頭にある。`count` は該当の `note` の数。
   * `tone` が `warn` / `ng` のものは数えない。
   */
  | { readonly kind: "crowded-notes"; readonly count: number }
  /** `fold` を持つ `markdown` の塊が `<details>` を含む、または `<details>` が入れ子になっている。`count` は塊の数。 */
  | { readonly kind: "nested-fold"; readonly count: number }
  /** 候補が採る → 検討 → 採らないの順に並んでいない `options` の塊がある。`count` は塊の数。 */
  | { readonly kind: "unordered-options"; readonly count: number }
  /** 行（`matrix` の `footer` の行を含む）のセルの数が `columns` と揃わない表がある。`count` は表の数。 */
  | { readonly kind: "ragged-table"; readonly count: number }
  /** 行が上限を超えるのに `rest` が空の `table` がある。`count` は表の数。 */
  | { readonly kind: "long-table"; readonly count: number }
  /** 強調の行（`emphasis`）が上限を超える `table` がある。`count` は表の数。 */
  | { readonly kind: "many-emphasis-rows"; readonly count: number }
  /** `emphasisColumn` が列の数以上の `table`・`matrix` がある。`count` は表の数。 */
  | { readonly kind: "emphasis-column-range"; readonly count: number }
  /** 行の `best` が列の数以上の `table` がある。`count` は表の数。 */
  | { readonly kind: "best-column-range"; readonly count: number }
  /** `heat` の範囲が列の外か範囲に 0 以上の数でないセルがある、または `totals` に `heat` が無いか範囲に `%` のセルがある `table` がある。`count` は表の数。 */
  | { readonly kind: "heat-range"; readonly count: number }
  /** 最初の行の `depth` が 0 でないか前の行より2段以上深い行がある、または `depth` のある行と `totals` を持つ `table` がある。`count` は表の数。 */
  | { readonly kind: "row-depth"; readonly count: number }
  /** 行が2つ以上で、ある列のセルの平均が全角 `SENTENCE_CELL_LENGTH` 字以上の `table` がある（インラインコードとリンクの URL は数えない）。`count` は表の数。 */
  | { readonly kind: "sentence-table"; readonly count: number }
  /** 項目が上限を超える `list` がある。`count` は塊の数。 */
  | { readonly kind: "long-list"; readonly count: number }
  /** `cards` の `list` の項目が 2〜4 の外、または `label` の空の項目がある。`faults` は塊の並びでの位置と項目数。 */
  | {
      readonly kind: "bad-cards"
      readonly count: number
      readonly faults: readonly CardsFault[]
    }
  /** `marks` が無く、行数が上限を超える `code` がある。`count` は塊の数。 */
  | { readonly kind: "long-code"; readonly count: number }
  /** `series` の `values` の数が `labels` と揃わない、または `arrow`・`slope`・`span` の `series` が2つでない `chart` の塊がある。`count` は塊の数。 */
  | { readonly kind: "ragged-chart"; readonly count: number }
  /** `panels` が 2〜6 の外、`values` の数が `labels` と揃わない系列がある、または `panels` の間で系列の `name` の組が違う `chartGrid` の塊がある。`count` は塊の数。 */
  | { readonly kind: "chart-grid-shape"; readonly count: number }
  /** `emphasis` に `labels` に無い名前がある `chart` の塊がある。`count` は塊の数。 */
  | { readonly kind: "unknown-emphasis"; readonly count: number }
  /** `references` を `line` 以外に、`annotations` を `line`・`bar`・`share`・`arrow` 以外に付けた、または `annotations` の `label` が `series` に無いか `index` が `labels` の外の `chart` の塊がある。`count` は塊の数。 */
  | { readonly kind: "chart-annotation-range"; readonly count: number }
  /** `tones` を `share` 以外に付けた、長さが `labels` と違う、または `emphasis` と併せた `chart` の塊がある。`count` は塊の数。 */
  | { readonly kind: "chart-tone-range"; readonly count: number }
  /** `stats` の項目の `series` が1〜2個のものがある塊がある。`count` は塊の数。 */
  | { readonly kind: "short-series"; readonly count: number }
  /** `path` を付けた `code` の塊が、そのファイルの中身と一致しない。`paths` は一致しなかった `path`（重複無し）。 */
  | { readonly kind: "code-mismatch"; readonly count: number; readonly paths: readonly string[] }
  /** `code` の塊の `marks` の `lines` が、読めない形かソースの行数の外にある。`count` はその塊の数。 */
  | { readonly kind: "code-marks-range"; readonly count: number }
  /** 見比べの画像の側の `region` が画像の外に出る、または幅か高さが 0 以下。`count` はその塊の数。 */
  | { readonly kind: "region-range"; readonly count: number }
  /**
   * `figure` の `none` の理由が本文と合わない。
   * `no-shape` なのに `sections` に流れ・つながり・構造を描く塊（`list` の `flow`・前後の `compare`・`graph`・`mermaid`・`svg`）がある（`count` はその塊の数）か、
   * `short-answer` なのにセクションが2つ以上ある（`count` はそのセクションの数）。
   */
  | {
      readonly kind: "figure-contradiction"
      readonly count: number
      readonly reason: "no-shape" | "short-answer"
    }

/** 塊の違反を、当てはまらないもの（`count` が 0）も含めて並べる。 */
export function detectBlockViolations(
  report: ReportDraft,
  outline: ReportOutline,
): readonly BlockViolation[] {
  const leaves = sectionLeaves(outline)
  const drawn = drawnLeaves(outline)
  const badCards = badCardsIn(leaves)
  const mismatchedCodeBlocks = leaves
    .filter(
      (leaf): leaf is Extract<ReportOutlineLeaf, { readonly component: "Code" }> =>
        leaf.component === "Code" && leaf.path.trim() !== "",
    )
    .filter((leaf) => {
      const content = report.fileContents.get(leaf.path)
      return content !== undefined && !codeBlockMatchesFile(leaf, content)
    })

  return [
    { kind: "too-many-notes", count: noteCount(outline) },
    { kind: "crowded-notes", count: crowdedNoteCount(outline) },
    { kind: "nested-fold", count: nestedFoldCount(outline) },
    {
      kind: "unordered-options",
      count: leaves.filter((leaf) => leaf.component === "Options" && !isVerdictOrdered(leaf))
        .length,
    },
    { kind: "ragged-table", count: leaves.filter((leaf) => isRaggedTable(leaf)).length },
    {
      kind: "long-table",
      count: leaves.filter(
        (leaf) =>
          leaf.component === "Table" &&
          leaf.rows.length > MAX_TABLE_ROWS &&
          leaf.rest.trim() === "",
      ).length,
    },
    {
      kind: "many-emphasis-rows",
      count: leaves.filter(
        (leaf) =>
          leaf.component === "Table" && leaf.rows.filter(isEmphasisRow).length > MAX_EMPHASIS_ROWS,
      ).length,
    },
    {
      kind: "emphasis-column-range",
      count: leaves.filter((leaf) => isEmphasisColumnOutOfRange(leaf)).length,
    },
    {
      kind: "best-column-range",
      count: leaves.filter((leaf) => isBestColumnOutOfRange(leaf)).length,
    },
    { kind: "heat-range", count: leaves.filter((leaf) => isBadHeat(leaf)).length },
    { kind: "row-depth", count: leaves.filter((leaf) => isBadRowDepth(leaf)).length },
    { kind: "sentence-table", count: leaves.filter((leaf) => isSentenceTable(leaf)).length },
    {
      kind: "long-list",
      count: leaves.filter(
        (leaf) => leaf.component === "ItemList" && leaf.items.length > MAX_LIST_ITEMS,
      ).length,
    },
    { kind: "bad-cards", count: badCards.length, faults: badCards },
    {
      kind: "long-code",
      count: leaves.filter(
        (leaf) =>
          leaf.component === "Code" &&
          leaf.marks.length === 0 &&
          sourceLineCount(leaf.source) > MAX_PLAIN_CODE_LINES,
      ).length,
    },
    { kind: "ragged-chart", count: drawn.filter((leaf) => isRaggedChart(leaf)).length },
    { kind: "chart-grid-shape", count: drawn.filter((leaf) => isBadChartGrid(leaf)).length },
    {
      kind: "unknown-emphasis",
      count: drawn.filter((leaf) => hasUnknownEmphasis(leaf)).length,
    },
    {
      kind: "chart-annotation-range",
      count: drawn.filter((leaf) => hasBadChartAnnotation(leaf)).length,
    },
    { kind: "chart-tone-range", count: drawn.filter((leaf) => hasBadChartTones(leaf)).length },
    { kind: "short-series", count: drawn.filter((leaf) => hasShortSeries(leaf)).length },
    {
      kind: "code-mismatch",
      count: mismatchedCodeBlocks.length,
      paths: unique(mismatchedCodeBlocks.map((leaf) => leaf.path)),
    },
    {
      kind: "code-marks-range",
      count: leaves.filter(
        (leaf) =>
          leaf.component === "Code" &&
          leaf.marks.some((mark) => !markFitsLines(mark, sourceLineCount(leaf.source))),
      ).length,
    },
    { kind: "region-range", count: drawn.filter((leaf) => hasBadRegion(leaf)).length },
    figureContradiction(report, outline),
  ]
}

const BLOCK_KINDS: ReadonlySet<string> = new Set<BlockViolation["kind"]>([
  "too-many-notes",
  "crowded-notes",
  "nested-fold",
  "unordered-options",
  "ragged-table",
  "long-table",
  "many-emphasis-rows",
  "emphasis-column-range",
  "best-column-range",
  "heat-range",
  "row-depth",
  "sentence-table",
  "long-list",
  "bad-cards",
  "long-code",
  "ragged-chart",
  "chart-grid-shape",
  "unknown-emphasis",
  "chart-annotation-range",
  "chart-tone-range",
  "short-series",
  "code-mismatch",
  "code-marks-range",
  "region-range",
  "figure-contradiction",
])

export function isBlockViolation(violation: {
  readonly kind: string
}): violation is BlockViolation {
  return BLOCK_KINDS.has(violation.kind)
}

function figureContradiction(
  report: ReportDraft,
  outline: ReportOutline,
): Extract<BlockViolation, { readonly kind: "figure-contradiction" }> {
  const figure = reportFigureOf(report.components)
  if (figure.kind === "none" && figure.reason === "no-shape") {
    return {
      kind: "figure-contradiction",
      count: sectionLeaves(outline).filter((leaf) => drawsShape(leaf)).length,
      reason: "no-shape",
    }
  }
  if (figure.kind === "none" && figure.reason === "short-answer") {
    return {
      kind: "figure-contradiction",
      count: outline.sections.length >= 2 ? outline.sections.length : 0,
      reason: "short-answer",
    }
  }
  return { kind: "figure-contradiction", count: 0, reason: "no-shape" }
}
