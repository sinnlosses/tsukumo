// 塊の検査の家族。違反の型・検出・差し戻し文を持つ。

import { markFitsLines, sourceLineCount } from "../../../../shared/report/code-mark.ts"
import { isEmphasisRow } from "../../../../shared/report/report-block-comparison.ts"
import {
  MAX_EMPHASIS_ROWS,
  MAX_LIST_ITEMS,
  MAX_PLAIN_CODE_LINES,
  MAX_TABLE_ROWS,
  SENTENCE_CELL_LENGTH,
} from "../../../../shared/report/report-limit.ts"
import {
  drawnLeaves,
  type ReportOutline,
  type ReportOutlineLeaf,
  reportFigureOf,
  sectionLeaves,
} from "../../../../shared/report/report-outline.ts"
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
  isEmphasisColumnOutOfRange,
  isRaggedChart,
  isRaggedTable,
  isSentenceTable,
  isVerdictOrdered,
  nestedFoldCount,
  noteCount,
} from "./block/shape.ts"
import type { ReportDraft } from "./draft.ts"

/** 差し戻す `cards` の塊の、塊の並びでの 1 始まりの位置と項目数。`unlabeled` は `label` の空の項目があること。 */
export type CardsFault = {
  readonly position: number
  readonly itemCount: number
  readonly unlabeled: boolean
}

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
  /** 行のセルの数が `columns` と揃わない表がある。`count` は表の数。 */
  | { readonly kind: "ragged-table"; readonly count: number }
  /** 行が上限を超えるのに `rest` が空の `table` がある。`count` は表の数。 */
  | { readonly kind: "long-table"; readonly count: number }
  /** 強調の行（`emphasis`）が上限を超える `table` がある。`count` は表の数。 */
  | { readonly kind: "many-emphasis-rows"; readonly count: number }
  /** `emphasisColumn` が列の数以上の `table` がある。`count` は表の数。 */
  | { readonly kind: "emphasis-column-range"; readonly count: number }
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
  /** `emphasis` に `labels` に無い名前がある `chart` の塊がある。`count` は塊の数。 */
  | { readonly kind: "unknown-emphasis"; readonly count: number }
  /** `references`・`annotations` を `line` 以外に付けた、または `annotations` の `label` が `series` に無いか `index` が `labels` の外の `chart` の塊がある。`count` は塊の数。 */
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
   * `no-shape` なのに `sections` に流れ・つながり・構造を描く塊（`list` の `flow`・前後の `compare`・`beforeAfter`・`graph`・`mermaid`・`svg`）がある（`count` はその塊の数）か、
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
      paths: [...new Set(mismatchedCodeBlocks.map((leaf) => leaf.path))],
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
  "heat-range",
  "row-depth",
  "sentence-table",
  "long-list",
  "bad-cards",
  "long-code",
  "ragged-chart",
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

/** 塊の違反を、差し戻すときの1行の文面にする。 */
export function blockViolationMessage(violation: BlockViolation): string {
  switch (violation.kind) {
    case "too-many-notes":
      return `\`Note\` が${violation.count}個ある。2個まで減らす`
    case "crowded-notes":
      return `隣り合う、または見出しの直後にある \`Note\` が${violation.count}個ある。間に別の部品を挟むか、\`Paragraph\` に直す（\`warn\` / \`ng\` は例外）`
    case "nested-fold":
      return `\`fold\` と \`<details>\` が入れ子になっている部品が${violation.count}個ある。畳むのは1段だけにする`
    case "unordered-options":
      return `候補が採る → 検討 → 採らないの順に並んでいない \`Options\` が${violation.count}個ある。採る候補から順に並べ直す`
    case "ragged-table":
      return `行のセルの数が \`columns\` と揃わない表（\`Matrix\` を含む）が${violation.count}個ある。セルの数を揃える`
    case "long-table":
      return `行が${String(MAX_TABLE_ROWS + 1)}以上で \`rest\` が空の表が${violation.count}個ある。上位${String(MAX_TABLE_ROWS)}行までを残し、残りを \`rest\` に書く`
    case "many-emphasis-rows":
      return `強調の行（\`emphasis\`）が${String(MAX_EMPHASIS_ROWS + 1)}行以上の表が${violation.count}個ある。強調は${String(MAX_EMPHASIS_ROWS)}行までに絞る`
    case "sentence-table":
      return `セルの平均が${String(SENTENCE_CELL_LENGTH)}字以上の列がある表が${violation.count}個ある。その列を \`label\` 付きの \`ItemList\` か \`Paragraph\` へ移すか、セルを語句・数・状態に縮める`
    case "long-list":
      return `項目が${String(MAX_LIST_ITEMS + 1)}件以上の \`ItemList\` が${violation.count}個ある。上位を残し、最後の項目を「ほか n 件」にして${String(MAX_LIST_ITEMS)}件までにする`
    case "bad-cards":
      return `\`cards\` の \`ItemList\` が項目数 2〜4 か、全項目に \`label\` を付ける形になっていない（${violation.faults
        .map(
          ({ position, itemCount, unlabeled }) =>
            `${String(position)}個目の部品は${String(itemCount)}項目${unlabeled ? "で `label` の空がある" : ""}`,
        )
        .join("・")}）。2〜4 項目に絞り全項目に題を付けるか、\`bullet\` / \`flow\` に直す`
    case "long-code":
      return `\`marks\` が無く${String(MAX_PLAIN_CODE_LINES + 1)}行以上の \`Code\` が${violation.count}個ある。要る範囲だけを引く（${String(MAX_PLAIN_CODE_LINES)}行まで）`
    case "ragged-chart":
      return `\`series\` の \`values\` の数が \`labels\` と揃わない、または \`arrow\`・\`slope\`・\`span\` の \`series\` が前と後（span は始まりと終わり）の2つでない \`Chart\` が${violation.count}個ある。数を揃える`
    case "emphasis-column-range":
      return `\`emphasisColumn\` が列の数以上の表が${violation.count}個ある。列の数より小さい位置（0 始まり）にする`
    case "heat-range":
      return `\`heat\` の範囲が列の外か範囲に数でないセルがある、または \`totals\` に \`heat\` が無いか範囲に % のセルがある表が${violation.count}個ある。\`heat\` は 0 以上の数だけの列（0 始まり・from ≦ to）に当て、\`totals\` は % でない数の範囲に付ける`
    case "row-depth":
      return `\`depth\` が最初の行で 0 でないか前の行より2段以上深い、または \`depth\` と \`totals\` を併せ持つ表が${violation.count}個ある。最初の行は \`depth\` を書かず、子は親の直下に1段深く置き、字下げのある表には \`totals\` を付けない`
    case "unknown-emphasis":
      return `\`emphasis\` に \`labels\` に無い名前がある \`Chart\` が${violation.count}個ある。\`labels\` にある名前だけにする`
    case "chart-annotation-range":
      return `\`references\`・\`annotations\` を \`line\` 以外に付けた、または \`annotations\` の \`label\` が \`series\` の \`name\` に無いか \`index\` が \`labels\` の外の \`Chart\` が${violation.count}個ある。\`line\` に付け、\`label\` は \`series\` の \`name\`、\`index\` は \`labels\` の数より小さい位置（0 始まり）にする`
    case "chart-tone-range":
      return `\`tones\` を \`share\` 以外に付けた、長さが \`labels\` と違う、または \`emphasis\` と併せた \`Chart\` が${violation.count}個ある。\`tones\` は \`share\` だけに \`labels\` と同じ数で書き、\`emphasis\` は空にする`
    case "short-series":
      return `\`Stats\` の \`series\` が1〜2個の項目がある部品が${violation.count}個ある。3つ以上にするか省く`
    case "code-mismatch":
      return `\`path\` 付きの \`Code\` が${violation.count}個、ファイルの中身と一致しない（${violation.paths.join("・")}）。実物を読み直して直すか \`path\` を外す`
    case "code-marks-range":
      return `\`Code\` の \`marks\` の \`lines\` が読めない形か \`source\` の行数の外にある部品が${violation.count}個ある。\`4-8\` か \`12\` の形で、行数以内に直す`
    case "region-range":
      return `\`Compare\`・\`BeforeAfter\` の画像の側の \`region\` が画像の外に出る、または \`width\`・\`height\` が 0 以下の部品が${violation.count}個ある。\`left\`・\`top\` は 0 以上、\`left + width\` と \`top + height\` は 100 以下、\`width\`・\`height\` は 0 より大きい%にする`
    case "figure-contradiction":
      return violation.reason === "no-shape"
        ? `\`figure\` の reason が \`no-shape\` なのに、\`Section\` に流れ・つながり・構造を描く部品（\`ItemList\` の \`flow\`・\`Compare\` の \`before-after\`・\`BeforeAfter\`・\`Graph\`・\`Mermaid\`・\`Svg\`）が${violation.count}個ある。その図を \`figure\` に置くか、合う reason にする`
        : `\`figure\` の reason が \`short-answer\` なのに、セクションが2つ以上ある。2〜3文で終わる答えでなければ \`figure\` に図を置くか、合う reason にする`
  }
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
