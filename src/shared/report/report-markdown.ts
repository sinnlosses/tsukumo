// 節の並びから Markdown を組む決まり。
//
// 逃げ道の `markdown` の塊だけは逃がさず、今の本文と同じ経路（許可リスト・mermaid・`chart`）で描く。

import { encodeMarks } from "./code-mark.ts"
import type { ReportBlock, ReportSection } from "./report-block.ts"
import { captionedMarkdown, type CaptionKind } from "./report-caption.ts"
import {
  compareMarkdown,
  beforeAfterMarkdown,
  dimensionMarkdown,
} from "./report-comparison-markdown.ts"
import {
  chartConfigOf,
  graphLegendMarkdown,
  graphSource,
  svgHtml,
  withSequenceAutonumber,
} from "./report-diagram-markdown.ts"
import { filesMarkdown } from "./report-file-markdown.ts"
import { imageMarkdown, type ReportImageSource } from "./report-image-markdown.ts"
import { fencedMarkdown, htmlInline, joinParts, markdownInline } from "./report-inline-markdown.ts"
import {
  claimsMarkdown,
  listMarkdown,
  optionsMarkdown,
  progressMarkdown,
} from "./report-list-markdown.ts"
import { REPORT_NOTE_KINDS } from "./report-notation.ts"
import { PAUSE_POINT_CLASS_NAME } from "./report-pause-point.ts"
import { statMarkdown } from "./report-stat-markdown.ts"
import {
  matrixMarkdown,
  type TagTones,
  tableMarkdown,
  tagTonesOf,
} from "./report-table-markdown.ts"

type CaptionCounts = Readonly<Record<CaptionKind, number>>

type SectionsFold = {
  readonly parts: readonly string[]
  readonly counts: CaptionCounts
}

/** 本文の位置に描く塊1つと、その塊に添える傍注（余白の柱に置くもの）。`body` が空なら傍注だけ。 */
type GutterGroup = {
  readonly body: string
  readonly notes: readonly string[]
}

/**
 * 節の並びを1つの Markdown に組む。空の塊・空の節は置かず、節の間は空行で区切る。
 * 節ごとの組み方は {@link reportSectionMarkdowns}。
 */
export function reportSectionsMarkdown(
  sections: readonly ReportSection[],
  imageSource: ReportImageSource,
): string {
  return reportSectionMarkdowns(sections, imageSource)
    .filter((part) => part.trim() !== "")
    .join("\n\n")
}

/**
 * 節ごとの Markdown。入力と同じ並び・同じ長さで、中身の無い節は空文字になる。
 * 題を持つ塊（図 6種・表 2種）は、節をまたいで並びの順に数えた「図 n」「表 n」の番号を1回だけ受け取る（{@link foldedBlockMarkdown}）。
 * 番号は題が空でも、`fold` の中でも数える。
 * 塊の `aside` と `memo` の `note` は傍注になり、直前の塊と一緒に包む（{@link gutterGroupMarkdown}）。
 * `memo` の `note` は本文の位置に残さない。節の最初の `memo` は塊の無い包みになる。
 */
export function reportSectionMarkdowns(
  sections: readonly ReportSection[],
  imageSource: ReportImageSource,
): readonly string[] {
  const tagTones = tagTonesOf(sections)
  const { parts } = sections.reduce<SectionsFold>(
    (acc, section) => {
      const blocks = section.blocks.reduce<{
        readonly groups: readonly GutterGroup[]
        readonly counts: CaptionCounts
      }>(
        (blockAcc, block) => {
          const kind = captionKindOf(block)
          const counts =
            kind === undefined
              ? blockAcc.counts
              : { ...blockAcc.counts, [kind]: blockAcc.counts[kind] + 1 }
          const ordinal = kind === undefined ? 0 : counts[kind]
          const notes = gutterNotesOf(block)
          const last = blockAcc.groups.at(-1)
          return {
            groups:
              isMemoNote(block) && last !== undefined
                ? [...blockAcc.groups.slice(0, -1), { ...last, notes: [...last.notes, ...notes] }]
                : [
                    ...blockAcc.groups,
                    { body: foldedBlockMarkdown(block, imageSource, ordinal, tagTones), notes },
                  ],
            counts,
          }
        },
        { groups: [], counts: acc.counts },
      )
      const part = joinParts([
        section.heading.trim() === "" ? "" : `## ${markdownInline(section.heading)}`,
        ...blocks.groups.map(gutterGroupMarkdown),
      ])
      return {
        parts: [...acc.parts, part.trim() === "" ? "" : part],
        counts: blocks.counts,
      }
    },
    { parts: [], counts: { figure: 0, table: 0 } },
  )
  return parts
}

/**
 * 本文の位置に描く `note` の種別 → 記法の class。ラベルは描く側が class から引く（`REPORT_NOTE_KINDS`）。注意・異常は筆を留める対象。
 * `memo` は傍注になる（{@link gutterNotesOf}）。
 */
const NOTE_CLASSES = {
  info: "note",
  warn: `note note-warn ${PAUSE_POINT_CLASS_NAME}`,
  ng: `note note-ng ${PAUSE_POINT_CLASS_NAME}`,
  ask: "note note-ask",
} as const satisfies Record<
  Exclude<Extract<ReportBlock, { readonly kind: "note" }>["tone"], "memo">,
  string
>

/** 傍注にした `memo` の頭に付けるラベル。 */
const MEMO_LABEL = new Map(REPORT_NOTE_KINDS).get("note-memo") ?? ""

function isMemoNote(block: ReportBlock): boolean {
  return block.kind === "note" && block.tone === "memo"
}

/** 塊の傍注。`memo` の `note` は本文を「メモ」のラベル付きで、塊の `aside` はそのあとに置く。 */
function gutterNotesOf(block: ReportBlock): readonly string[] {
  return [
    ...(block.kind === "note" && block.tone === "memo"
      ? [gutterNoteMarkdown(MEMO_LABEL, block.text)]
      : []),
    gutterNoteMarkdown("", block.aside),
  ].filter((note) => note !== "")
}

function gutterNoteMarkdown(label: string, text: string): string {
  if (text.trim() === "") {
    return ""
  }
  const labelHtml = label === "" ? "" : `<span class="gutter-note-label">${label}</span>`
  return `<aside class="gutter-note">\n\n${labelHtml}${markdownInline(text)}\n\n</aside>`
}

function gutterGroupMarkdown({ body, notes }: GutterGroup): string {
  if (notes.length === 0) {
    return body
  }
  return joinParts([
    '<div class="with-gutter">',
    body,
    joinParts(['<div class="gutter">', ...notes, "</div>"]),
    "</div>",
  ])
}

function foldedBlockMarkdown(
  block: ReportBlock,
  imageSource: ReportImageSource,
  ordinal: number,
  tagTones: TagTones,
): string {
  const markdown = blockMarkdown(block, imageSource, ordinal, tagTones)
  return block.fold.trim() === "" || markdown.trim() === ""
    ? markdown
    : `<details><summary>${htmlInline(block.fold)}</summary>\n\n${markdown}\n\n</details>`
}

function blockMarkdown(
  block: ReportBlock,
  imageSource: ReportImageSource,
  ordinal: number,
  tagTones: TagTones,
): string {
  switch (block.kind) {
    case "text":
      return markdownInline(block.text)
    case "list":
      return listMarkdown(block)
    case "table":
      return tableMarkdown(block, ordinal, tagTones)
    case "matrix":
      return matrixMarkdown(block, ordinal)
    case "compare":
      return compareMarkdown(block, ordinal)
    case "beforeAfter":
      return beforeAfterMarkdown(block, imageSource, ordinal)
    case "dimension":
      return dimensionMarkdown(block, ordinal)
    case "note":
      return block.tone === "memo" || block.text.trim() === ""
        ? ""
        : `<div class="${NOTE_CLASSES[block.tone]}">\n\n${markdownInline(block.text)}\n\n</div>`
    case "stats":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: "",
        body: `<div class="stats">${block.items.map(statMarkdown).join("")}</div>`,
        bodyFormat: "html",
        fit: false,
      })
    case "code":
      return fencedMarkdown(codeInfo(block), block.source)
    case "mermaid":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: block.title,
        body: fencedMarkdown("mermaid", withSequenceAutonumber(block.source)),
        bodyFormat: "markdown",
        fit: false,
      })
    case "graph":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: block.title,
        body: joinParts([
          fencedMarkdown("mermaid", graphSource(block)),
          graphLegendMarkdown(block),
        ]),
        bodyFormat: "markdown",
        fit: false,
      })
    case "chart":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: block.title,
        body: fencedMarkdown("chart", JSON.stringify(chartConfigOf(block))),
        bodyFormat: "markdown",
        fit: false,
      })
    case "svg":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: block.title,
        body: svgHtml(block),
        bodyFormat: "html",
        fit: true,
      })
    case "progress":
      return progressMarkdown(block)
    case "options":
      return optionsMarkdown(block)
    case "claims":
      return claimsMarkdown(block)
    case "image":
      return imageMarkdown(block, imageSource, ordinal)
    case "files":
      return ordinal === 0
        ? filesMarkdown(block)
        : captionedMarkdown({
            kind: "figure",
            ordinal,
            title: block.title,
            body: filesMarkdown(block),
            bodyFormat: "html",
            fit: false,
          })
    case "markdown":
      return block.markdown
  }
}

function captionKindOf(block: ReportBlock): CaptionKind | undefined {
  switch (block.kind) {
    case "image":
    case "dimension":
    case "compare":
    case "beforeAfter":
    case "mermaid":
    case "graph":
    case "chart":
    case "svg":
    case "stats":
      return "figure"
    case "table":
    case "matrix":
      return "table"
    case "files":
      return block.title.trim() === "" ? undefined : "figure"
    default:
      return undefined
  }
}

/**
 * `code` の塊のフェンスの info。先頭の語は言語として読まれるので、言語が空でパスか印があるときは `text` で埋める
 * （埋めないとパスや印の語が言語になり、`marks` が描画側へ届かない）。
 */
function codeInfo(block: Extract<ReportBlock, { readonly kind: "code" }>): string {
  const rest = [block.path, block.marks.length === 0 ? "" : encodeMarks(block.marks)].filter(
    (part) => part.trim() !== "",
  )
  const language = block.language.trim() === "" && rest.length > 0 ? "text" : block.language
  return [language, ...rest].filter((part) => part.trim() !== "").join(" ")
}
