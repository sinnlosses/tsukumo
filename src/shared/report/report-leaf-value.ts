// 節の並びを畳み込んで、葉ごとの図表番号・表の札の色・余白の柱の傍注を決める。
//
// 番号は節をまたいで並びの順に通しで数える。

import { plotDrawingOf } from "./plot-drawing.ts"
import { tableRowCells } from "./report-block-comparison.ts"
import type { ReportBlock, ReportBlockSection } from "./report-block.ts"
import type { CaptionKind } from "./report-caption.ts"
import { REPORT_NOTE_KINDS } from "./report-notation.ts"
import { type TagTones, tagTonesOf } from "./report-table-markdown.ts"

/** 葉の題の番号。題を持たない葉は `none`。 */
export type LeafCaptionNumber =
  | { readonly kind: "none" }
  | { readonly kind: CaptionKind; readonly ordinal: number }

/** 余白の柱の傍注1つ。`label` が空なら頭のラベルは付けない。`text` は Markdown の前の字そのもの。 */
export type LeafGutterNote = { readonly label: string; readonly text: string }

/**
 * 葉1つの値。
 * `tagTones` は表の葉が使う `tag` の字 → 札の色の class（表以外は空）。
 * `gutterNotes` は葉に寄った傍注（葉の `aside` と、直後の `memo` の `note`）。
 * `mergedIntoPrevious` は直前の葉へ傍注を寄せた `memo` の葉で、この葉自身は何も描かず `gutterNotes` も空。
 */
export type LeafValue = {
  readonly captionNumber: LeafCaptionNumber
  readonly tagTones: Readonly<Record<string, string>>
  readonly gutterNotes: readonly LeafGutterNote[]
  readonly mergedIntoPrevious: boolean
}

type CaptionCounts = Readonly<Record<CaptionKind, number>>

type BlocksFold = {
  readonly values: readonly LeafValue[]
  readonly counts: CaptionCounts
  /** 傍注を受ける、直前の包みの `values` の位置。無ければ -1。 */
  readonly ownerIndex: number
}

/** 傍注にした `memo` の頭に付けるラベル。 */
const MEMO_LABEL = new Map(REPORT_NOTE_KINDS).get("note-memo") ?? ""

/**
 * 節の並びから導いた、札の色の割り当て（`tagTones`）と葉ごとの値（`values`）。
 * `values` は入力の節・塊と同じ並び・同じ長さ。
 * 図と表の番号は題が空でも、`fold` の中でも数える。`memo` の `note` は直前の葉の傍注へ寄せる。
 */
export type ReportLeafLayout = {
  readonly tagTones: TagTones
  readonly values: readonly (readonly LeafValue[])[]
}

export function reportLeafLayoutOf(sections: readonly ReportBlockSection[]): ReportLeafLayout {
  const tagTones = tagTonesOf(sections.flatMap((section) => section.blocks))
  const { perSection } = sections.reduce<{
    readonly perSection: readonly (readonly LeafValue[])[]
    readonly counts: CaptionCounts
  }>(
    (acc, section) => {
      const folded = valuesOfBlocks(section.blocks, acc.counts, tagTones)
      return { perSection: [...acc.perSection, folded.values], counts: folded.counts }
    },
    { perSection: [], counts: { figure: 0, table: 0 } },
  )
  return { tagTones, values: perSection }
}

function valuesOfBlocks(
  blocks: readonly ReportBlock[],
  counts: CaptionCounts,
  tagTones: ReadonlyMap<string, string>,
): BlocksFold {
  return blocks.reduce<BlocksFold>((acc, block) => withLeafValue(acc, block, tagTones), {
    values: [],
    counts,
    ownerIndex: -1,
  })
}

function withLeafValue(
  acc: BlocksFold,
  block: ReportBlock,
  tagTones: ReadonlyMap<string, string>,
): BlocksFold {
  const kind = captionKindOf(block)
  const counts = kind === undefined ? acc.counts : { ...acc.counts, [kind]: acc.counts[kind] + 1 }
  const gutterNotes = [
    ...(block.kind === "note" && block.tone === "memo" ? textNotes(MEMO_LABEL, block.text) : []),
    ...asideNotes(block.aside),
  ]
  if (block.kind === "note" && block.tone === "memo" && acc.ownerIndex >= 0) {
    return {
      values: [
        ...acc.values.map((value, index) =>
          index === acc.ownerIndex
            ? { ...value, gutterNotes: [...value.gutterNotes, ...gutterNotes] }
            : value,
        ),
        {
          captionNumber: { kind: "none" },
          tagTones: {},
          gutterNotes: [],
          mergedIntoPrevious: true,
        },
      ],
      counts,
      ownerIndex: acc.ownerIndex,
    }
  }
  return {
    values: [
      ...acc.values,
      {
        captionNumber: kind === undefined ? { kind: "none" } : { kind, ordinal: counts[kind] },
        tagTones: tagTonesUsedBy(block, tagTones),
        gutterNotes,
        mergedIntoPrevious: false,
      },
    ],
    counts,
    ownerIndex: acc.values.length,
  }
}

function asideNotes(aside: string): readonly LeafGutterNote[] {
  return textNotes("", aside)
}

function textNotes(label: string, text: string): readonly LeafGutterNote[] {
  return text.trim() === "" ? [] : [{ label, text }]
}

function tagTonesUsedBy(
  block: ReportBlock,
  tagTones: ReadonlyMap<string, string>,
): Readonly<Record<string, string>> {
  if (block.kind !== "table") {
    return {}
  }
  const used = block.rows
    .flatMap(tableRowCells)
    .flatMap((cell) => (typeof cell === "object" && "tag" in cell ? [cell.tag] : []))
  return Object.fromEntries(
    used.flatMap((tag): readonly (readonly [string, string])[] => {
      const tone = tagTones.get(tag)
      return tone === undefined ? [] : [[tag, tone]]
    }),
  )
}

/** 題に番号を振る塊の分類。`plot` は描く形に合わせる（表に落ちたものは表、グラフは図）。 */
function captionKindOf(block: ReportBlock): CaptionKind | undefined {
  switch (block.kind) {
    case "image":
    case "compare":
    case "beforeAfter":
    case "mermaid":
    case "graph":
    case "chart":
    case "svg":
    case "timeline":
    case "stats":
      return "figure"
    case "table":
    case "matrix":
      return "table"
    case "plot":
      return plotDrawingOf(block).kind === "table" ? "table" : "figure"
    case "files":
      return block.title.trim() === "" ? undefined : "figure"
    default:
      return undefined
  }
}
