// 節の並びを畳み込んで、内容部品ごとの図表番号・表の札の色・欄外注を決める。
//
// 番号は節をまたいで並びの順に通しで数える。

import { parseInlineMarks } from "./inline-mark.ts"
import { plotDrawingOf } from "./plot-drawing.ts"
import { tableRowCells } from "./report-block-comparison.ts"
import type { LeafComponent, ReportSection } from "./report-block.ts"
import type { CaptionKind } from "./report-caption.ts"
import { REPORT_NOTE_KINDS } from "./report-notation.ts"
import type { ReportSourceEntry } from "./report-progress-field.ts"
import { type TagTones, tagTonesOf } from "./report-table-markdown.ts"

/** 内容部品の題の番号。題を持たない内容部品は `none`。 */
export type LeafCaptionNumber =
  | { readonly kind: "none" }
  | { readonly kind: CaptionKind; readonly ordinal: number }

/** 欄外注1つ。`label` が空なら頭のラベルは付けない。`text` は Markdown の前の字そのもの。 */
export type LeafGutterNote = { readonly label: string; readonly text: string }

/**
 * 内容部品1つの値。
 * `tagTones` は表の内容部品が使う `tag` の字 → 札の色の class（表以外は空）。
 * `gutterNotes` は内容部品に寄った欄外注（内容部品の `aside` と、直後の `memo` の `note`）。
 * `mergedIntoPrevious` は直前の内容部品へ欄外注を寄せた `memo` の内容部品で、この内容部品自身は何も描かず `gutterNotes` も空。
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
  /** 欄外注を受ける、直前の包みの `values` の位置。無ければ -1。 */
  readonly ownerIndex: number
  /** 欄外注を添え終えた出どころの番号。 */
  readonly seenSources: ReadonlySet<number>
}

/** 欄外注にした `memo` の頭に付けるラベル。 */
const MEMO_LABEL = new Map(REPORT_NOTE_KINDS).get("note-memo") ?? ""

/**
 * 節の並びから導いた、札の色の割り当て（`tagTones`）と内容部品ごとの値（`values`）。
 * `values` は入力の節・塊と同じ並び・同じ長さ。
 * 図と表の番号は題が空でも、`fold` の中でも数える。`memo` の `note` は直前の内容部品の欄外注へ寄せる。
 */
export type ReportLeafLayout = {
  readonly tagTones: TagTones
  readonly values: readonly (readonly LeafValue[])[]
}

/**
 * `sources` は出どころの並び。番号 `{{src: n}}` が最初に現れる内容部品に、その出どころの場所と補いを欄外注で添える（2度目からは添えない）。
 */
export function reportLeafLayoutOf(
  sections: readonly ReportSection[],
  sources: readonly ReportSourceEntry[],
): ReportLeafLayout {
  const tagTones = tagTonesOf(sections.flatMap((section) => section.blocks))
  const context = { tagTones, sources }
  const { perSection } = sections.reduce<{
    readonly perSection: readonly (readonly LeafValue[])[]
    readonly counts: CaptionCounts
    readonly seenSources: ReadonlySet<number>
  }>(
    (acc, section) => {
      const folded = valuesOfBlocks(section.blocks, acc.counts, acc.seenSources, context)
      return {
        perSection: [...acc.perSection, folded.values],
        counts: folded.counts,
        seenSources: folded.seenSources,
      }
    },
    { perSection: [], counts: { figure: 0, table: 0 }, seenSources: new Set() },
  )
  return { tagTones, values: perSection }
}

type LayoutContext = {
  readonly tagTones: ReadonlyMap<string, string>
  readonly sources: readonly ReportSourceEntry[]
}

function valuesOfBlocks(
  blocks: readonly LeafComponent[],
  counts: CaptionCounts,
  seenSources: ReadonlySet<number>,
  context: LayoutContext,
): BlocksFold {
  return blocks.reduce<BlocksFold>((acc, block) => withLeafValue(acc, block, context), {
    values: [],
    counts,
    ownerIndex: -1,
    seenSources,
  })
}

function withLeafValue(acc: BlocksFold, block: LeafComponent, context: LayoutContext): BlocksFold {
  const { tagTones } = context
  const kind = captionKindOf(block)
  const counts = kind === undefined ? acc.counts : { ...acc.counts, [kind]: acc.counts[kind] + 1 }
  const firstSources = context.sources.filter(
    (source) => !acc.seenSources.has(source.mark) && sourceNumbersIn(block).has(source.mark),
  )
  const seenSources = new Set([...acc.seenSources, ...firstSources.map((source) => source.mark)])
  const gutterNotes = [
    ...(block.kind === "note" && block.tone === "memo" ? textNotes(MEMO_LABEL, block.text) : []),
    ...asideNotes(block.aside),
    ...firstSources.map(sourceNote),
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
      seenSources,
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
    seenSources,
  }
}

function asideNotes(aside: string): readonly LeafGutterNote[] {
  return textNotes("", aside)
}

/** 場所はインラインコードにして、欄外注の中でもファイルの覗きが効くようにする。 */
function sourceNote(source: ReportSourceEntry): LeafGutterNote {
  const note = source.note?.trim() ?? ""
  return {
    label: String(source.mark),
    text: note === "" ? `\`${source.place}\`` : `\`${source.place}\` ${note}`,
  }
}

/** 内容部品の字の欄のどこかに置いた出どころの番号。 */
function sourceNumbersIn(block: LeafComponent): ReadonlySet<number> {
  return new Set(
    stringsIn(block).flatMap((text) =>
      text.includes("{{src:")
        ? parseInlineMarks(text).flatMap((segment) =>
            segment.kind === "mark" && segment.mark.kind === "source" ? [segment.mark.number] : [],
          )
        : [],
    ),
  )
}

function stringsIn(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsIn)
  }
  return typeof value === "object" && value !== null ? Object.values(value).flatMap(stringsIn) : []
}

function textNotes(label: string, text: string): readonly LeafGutterNote[] {
  return text.trim() === "" ? [] : [{ label, text }]
}

function tagTonesUsedBy(
  block: LeafComponent,
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
function captionKindOf(block: LeafComponent): CaptionKind | undefined {
  switch (block.kind) {
    case "image":
    case "compare":
    case "mermaid":
    case "graph":
    case "chart":
    case "chartGrid":
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
