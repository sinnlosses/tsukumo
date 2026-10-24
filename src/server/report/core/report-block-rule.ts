// レポートの検査のうち、塊の形（数・順・並び・種類）を判定する述語。

import type { ReportBlock, ReportSection } from "../../../shared/report/report-block.ts"
import { MAX_CANDIDATES, SENTENCE_CELL_LENGTH } from "../../../shared/report/report-limit.ts"
import { textLengthOf } from "./markdown-tree.ts"
import type { CardsFault } from "./report-violation.ts"

/** 流れ・つながり・構造を描く塊か（`no-shape` と合わない塊）。 */
export function drawsShape(block: ReportBlock): boolean {
  switch (block.kind) {
    case "list":
      return block.style === "flow"
    case "beforeAfter":
    case "graph":
    case "mermaid":
    case "svg":
      return true
    default:
      return false
  }
}

const MIN_CARDS = 2
const MAX_CARDS = 4

export function badCardsIn(blocks: readonly ReportBlock[]): readonly CardsFault[] {
  return blocks.flatMap((block, index) => {
    if (block.kind !== "list" || block.style !== "cards") {
      return []
    }
    const itemCount = block.items.length
    const unlabeled = block.items.some((item) => item.label.trim() === "")
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
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "options" }>["items"][number]["verdict"],
  number
>

export function crowdedNoteCount(sections: readonly ReportSection[]): number {
  return sections.reduce(
    (total, section) =>
      total +
      section.blocks.filter(
        (block, index) =>
          block.kind === "note" &&
          block.tone !== "warn" &&
          block.tone !== "ng" &&
          (section.blocks[index - 1]?.kind === "note" ||
            (index === 0 && section.heading.trim() !== "")),
      ).length,
    0,
  )
}

export function hasTooManyCandidates(block: ReportBlock): boolean {
  switch (block.kind) {
    case "options":
      return block.items.length > MAX_CANDIDATES
    case "compare":
      return block.sides.some((side) => side.points.length > MAX_CANDIDATES)
    case "beforeAfter":
      return [block.before, block.after].some(
        (side) => side.kind === "points" && side.points.length > MAX_CANDIDATES,
      )
    case "image":
      return block.notes.length > MAX_CANDIDATES
    default:
      return false
  }
}

/** `beforeAfter` の画像の側の `region` が、画像の外に出る、または幅か高さが 0 以下の塊か。 */
export function hasBadRegion(block: ReportBlock): boolean {
  return (
    block.kind === "beforeAfter" &&
    [block.before, block.after].some((side) => {
      if (side.kind !== "image" || side.region === undefined) return false
      const { left, top, width, height } = side.region
      return (
        width <= 0 || height <= 0 || left < 0 || top < 0 || left + width > 100 || top + height > 100
      )
    })
  )
}

export function isVerdictOrdered(
  block: Extract<ReportBlock, { readonly kind: "options" }>,
): boolean {
  const ranks = block.items.map((item) => VERDICT_ORDER[item.verdict])
  return ranks.every((rank, index) => index === 0 || (ranks[index - 1] ?? rank) <= rank)
}

/** 行のセルの数が列の数と揃わない表か。 */
export function isRaggedTable(block: ReportBlock): boolean {
  switch (block.kind) {
    case "table":
      return block.rows.some((row) => row.length !== block.columns.length)
    case "matrix":
      return block.rows.some(({ cells }) => cells.length !== block.columns.length)
    default:
      return false
  }
}

/**
 * 行が2つ以上で、ある列のセルの平均が {@link SENTENCE_CELL_LENGTH} 字以上の表か。
 * 字数はセルを構文木にした `text` ノードだけを数え、インラインコードとリンクの URL は数えない。
 */
export function isSentenceTable(block: ReportBlock): boolean {
  if (block.kind !== "table" || block.rows.length < 2) return false
  return block.columns.some((_, column) => {
    const total = block.rows.reduce((sum, row) => {
      const cell = row[column]
      return cell === undefined ? sum : sum + cellLength(cell)
    }, 0)
    return total / block.rows.length >= SENTENCE_CELL_LENGTH
  })
}

export function hasShortSeries(block: ReportBlock): boolean {
  return (
    block.kind === "stats" &&
    block.items.some((item) => item.series.length > 0 && item.series.length < 3)
  )
}

/** 系列の値の数が labels の数と揃わない、または arrow・slope・span の系列が2つでない chart の塊か。 */
export function isRaggedChart(block: ReportBlock): boolean {
  return (
    block.kind === "chart" &&
    (block.series.some((series) => series.values.length !== block.labels.length) ||
      ((block.chartKind === "arrow" || block.chartKind === "slope" || block.chartKind === "span") &&
        block.series.length !== 2))
  )
}

export function hasUnknownEmphasis(block: ReportBlock): boolean {
  return block.kind === "chart" && block.emphasis.some((name) => !block.labels.includes(name))
}

type TableCell = Extract<ReportBlock, { readonly kind: "table" }>["rows"][number][number]

function cellLength(cell: TableCell): number {
  if (typeof cell === "string") return textLengthOf(cell)
  return "text" in cell ? textLengthOf(cell.text) : textLengthOf(cell.from) + textLengthOf(cell.to)
}
