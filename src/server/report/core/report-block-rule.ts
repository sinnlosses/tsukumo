// レポートの検査のうち、塊の形（数・順・並び・種類）を判定する述語。

import { sumBy } from "remeda"

import { type TableCell, tableRowCells } from "../../../shared/report/report-block-comparison.ts"
import { SENTENCE_CELL_LENGTH } from "../../../shared/report/report-limit.ts"
import type { ReportOutline, ReportOutlineLeaf } from "../../../shared/report/report-outline.ts"
import { textLengthOf } from "./markdown-tree.ts"
import { hasNestedFold } from "./report-markdown-notation.ts"
import type { CardsFault } from "./report-violation.ts"

/** 流れ・つながり・構造を描く塊か（`no-shape` と合わない塊）。 */
export function drawsShape(leaf: ReportOutlineLeaf): boolean {
  switch (leaf.component) {
    case "ItemList":
      return leaf.style === "flow"
    case "BeforeAfter":
    case "Graph":
    case "Mermaid":
    case "Svg":
    case "Timeline":
      return true
    default:
      return false
  }
}

const MIN_CARDS = 2
const MAX_CARDS = 4

export function badCardsIn(leaves: readonly ReportOutlineLeaf[]): readonly CardsFault[] {
  return leaves.flatMap((leaf, index) => {
    if (leaf.component !== "ItemList" || leaf.style !== "cards") {
      return []
    }
    const itemCount = leaf.items.length
    const unlabeled = leaf.items.some((item) => item.label.trim() === "")
    return itemCount < MIN_CARDS || itemCount > MAX_CARDS || unlabeled
      ? [{ position: index + 1, itemCount, unlabeled }]
      : []
  })
}

/** `options` の候補を書く順。 */
const VERDICT_ORDER = {
  adopt: 0,
  consider: 1,
  reject: 2,
} as const satisfies Record<OptionsLeaf["items"][number]["verdict"], number>

type OptionsLeaf = Extract<ReportOutlineLeaf, { readonly component: "Options" }>

/** 葉の平らな並び（配置の部品の中の葉も外側の節へ入る）で、`Note` の直後か見出しの直後にある `Note` の数。 */
export function crowdedNoteCount(outline: ReportOutline): number {
  return sumBy(outline.sections, (section) =>
    crowdedNotesIn(section.leaves, section.kind === "section" && section.heading.trim() !== ""),
  )
}

export function noteCount(outline: ReportOutline): number {
  return sumBy(
    outline.sections,
    (section) => section.leaves.filter((leaf) => leaf.component === "Note").length,
  )
}

/** `fold` を持つ `Markdown` が `<details>` を含む、または `<details>` が入れ子になっている数。 */
export function nestedFoldCount(outline: ReportOutline): number {
  return sumBy(
    outline.sections,
    (section) =>
      section.leaves.filter((leaf) => leaf.component === "Markdown" && hasNestedFold(leaf)).length,
  )
}

/** `beforeAfter` の画像の側の `region` が、画像の外に出る、または幅か高さが 0 以下の塊か。 */
export function hasBadRegion(leaf: ReportOutlineLeaf): boolean {
  return (
    leaf.component === "BeforeAfter" &&
    [leaf.before, leaf.after].some((side) => {
      if (side.kind !== "image" || side.region === undefined) return false
      const { left, top, width, height } = side.region
      return (
        width <= 0 || height <= 0 || left < 0 || top < 0 || left + width > 100 || top + height > 100
      )
    })
  )
}

export function isVerdictOrdered(leaf: OptionsLeaf): boolean {
  const ranks = leaf.items.map((item) => VERDICT_ORDER[item.verdict])
  return ranks.every((rank, index) => index === 0 || (ranks[index - 1] ?? rank) <= rank)
}

/** 行のセルの数が列の数と揃わない表か。 */
export function isRaggedTable(leaf: ReportOutlineLeaf): boolean {
  switch (leaf.component) {
    case "Table":
      return leaf.rows.some((row) => tableRowCells(row).length !== leaf.columns.length)
    case "Matrix":
      return leaf.rows.some(({ cells }) => cells.length !== leaf.columns.length)
    default:
      return false
  }
}

/**
 * 行が2つ以上で、ある列のセルの平均が {@link SENTENCE_CELL_LENGTH} 字以上の表か。
 * 字数はセルを構文木にした `text` ノードだけを数え、インラインコードとリンクの URL は数えない。
 */
export function isSentenceTable(leaf: ReportOutlineLeaf): boolean {
  if (leaf.component !== "Table" || leaf.rows.length < 2) return false
  const { rows } = leaf
  return leaf.columns.some((_, column) => {
    const total = rows.reduce((sum, row) => {
      const cell = tableRowCells(row)[column]
      return cell === undefined ? sum : sum + cellLength(cell)
    }, 0)
    return total / rows.length >= SENTENCE_CELL_LENGTH
  })
}

export function hasShortSeries(leaf: ReportOutlineLeaf): boolean {
  return (
    leaf.component === "Stats" &&
    leaf.items.some((item) => item.series.length > 0 && item.series.length < 3)
  )
}

/** 系列の値の数が labels の数と揃わない、または arrow・slope・span の系列が2つでない Chart か。 */
export function isRaggedChart(leaf: ReportOutlineLeaf): boolean {
  return (
    leaf.component === "Chart" &&
    (leaf.series.some((series) => series.values.length !== leaf.labels.length) ||
      ((leaf.chartKind === "arrow" || leaf.chartKind === "slope" || leaf.chartKind === "span") &&
        leaf.series.length !== 2))
  )
}

export function hasUnknownEmphasis(leaf: ReportOutlineLeaf): boolean {
  return leaf.component === "Chart" && leaf.emphasis.some((name) => !leaf.labels.includes(name))
}

function cellLength(cell: TableCell): number {
  if (typeof cell === "string") return textLengthOf(cell)
  if ("tag" in cell) return textLengthOf(cell.tag)
  return "text" in cell ? textLengthOf(cell.text) : textLengthOf(cell.from) + textLengthOf(cell.to)
}

/** 並びの中で、`note` の直後か見出しの直後に置いた `note`（`warn`・`ng` を除く）の数。 */
function crowdedNotesIn(leaves: readonly ReportOutlineLeaf[], headed: boolean): number {
  return leaves.filter(
    (leaf, index) =>
      leaf.component === "Note" &&
      leaf.tone !== "warn" &&
      leaf.tone !== "ng" &&
      (leaves[index - 1]?.component === "Note" || (index === 0 && headed)),
  ).length
}
