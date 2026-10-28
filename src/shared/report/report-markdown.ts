// 節の並びから Markdown を組む決まり。
//
// 逃げ道の `markdown` の塊だけは逃がさず、今の本文と同じ経路（許可リスト・mermaid・`chart`）で描く。

import { zip } from "remeda"

import { cardChainHtml } from "./card-chain-markdown.ts"
import { encodeMarks } from "./code-mark.ts"
import { plotRows, type ReportPlot } from "./figure-grammar.ts"
import { graphDrawingOf } from "./graph-drawing.ts"
import { graphFoldHtml } from "./graph-fold-html.ts"
import { plotDrawingOf } from "./plot-drawing.ts"
import type { ReportBlock, ReportSection, SectionBlock } from "./report-block.ts"
import { captionedMarkdown } from "./report-caption.ts"
import { compareMarkdown, beforeAfterMarkdown } from "./report-comparison-markdown.ts"
import { chartConfigOf, svgHtml, withSequenceAutonumber } from "./report-diagram-markdown.ts"
import { filesMarkdown } from "./report-file-markdown.ts"
import { graphLegendMarkdown } from "./report-graph-markdown.ts"
import { imageMarkdown, type ReportImageSource } from "./report-image-markdown.ts"
import { fencedMarkdown, htmlInline, joinParts, markdownInline } from "./report-inline-markdown.ts"
import {
  type LeafGutterNote,
  type LeafValue,
  type ReportLeafLayout,
  reportLeafLayoutOf,
} from "./report-leaf-value.ts"
import { claimsMarkdown, listMarkdown, optionsMarkdown } from "./report-list-markdown.ts"
import { PAUSE_POINT_CLASS_NAME } from "./report-pause-point.ts"
import { statMarkdown } from "./report-stat-markdown.ts"
import { matrixMarkdown, type TagTones, tableMarkdown } from "./report-table-markdown.ts"
import { arrangedBlockMarkdown } from "./row-panel-markdown.ts"
import { timelineHtml } from "./timeline-markdown.ts"

/**
 * 節1つの Markdown を塊ごとに分けたもの。`heading` は見出しの行（見出しの無い節は空文字）。
 * `blocks` は節の塊と同じ並び・同じ長さで、`memo` の `note` を前の包みへ寄せた塊と中身の無い塊は空文字。
 */
export type ReportSectionPieces = {
  readonly heading: string
  readonly blocks: readonly string[]
}

/**
 * 節の並びを1つの Markdown に組む。空の塊・空の節は置かず、節の間は空行で区切る。
 * 節ごとの組み方は {@link reportSectionPieces}。
 */
export function reportSectionsMarkdown(
  sections: readonly ReportSection[],
  imageSource: ReportImageSource,
): string {
  return joinParts(
    reportSectionPieces(sections, imageSource).map((pieces) =>
      joinParts([pieces.heading, ...pieces.blocks]),
    ),
  )
}

/**
 * 節ごとの Markdown を塊ごとに分けて返す。入力と同じ並び・同じ長さ。
 * 見出しと塊を `joinParts` で繋ぐと節1つの Markdown になる（中身の無い節は空文字）。
 * 題の番号と傍注は `layout`（既定は `sections` から導く）の値を使う（番号は節をまたいで並びの順に数え、塊は番号を1回だけ受け取る）。
 * 塊の `aside` と `memo` の `note` は傍注になり、直前の塊と一緒に包む（{@link gutterGroupMarkdown}）。
 * `memo` の `note` は本文の位置に残さない。節の最初の `memo` は塊の無い包みになる。
 * `row`・`panel` は子を葉の塊と同じ手で描き、1つの包みにする（{@link blockBodyMarkdown}）。
 */
export function reportSectionPieces(
  sections: readonly ReportSection[],
  imageSource: ReportImageSource,
  layout: ReportLeafLayout = reportLeafLayoutOf(sections),
): readonly ReportSectionPieces[] {
  const { tagTones, values } = layout
  return zip(sections, values).map(([section, sectionValues]) => ({
    heading: section.heading.trim() === "" ? "" : `## ${markdownInline(section.heading)}`,
    blocks: zip(section.blocks, sectionValues).map(([block, value]) =>
      value.mergedIntoPrevious
        ? ""
        : gutterGroupMarkdown(
            blockBodyMarkdown(block, value, imageSource, tagTones),
            value.gutterNotes,
          ),
    ),
  }))
}

/**
 * 塊の本文の位置に描く Markdown。`row`・`panel` は子を葉の塊と同じ手で描き、親の `fold` は容れ物ごと畳む。
 * 傍注を直前へ寄せた `memo` の子は容れ物の中に置かない。
 */
function blockBodyMarkdown(
  block: SectionBlock,
  value: LeafValue,
  imageSource: ReportImageSource,
  tagTones: TagTones,
): string {
  if (block.kind === "row" || block.kind === "panel") {
    const children = zip(block.blocks, value.children)
      .filter(([, child]) => !child.mergedIntoPrevious)
      .map(([child, childValue]) => foldedBlockMarkdown(child, childValue, imageSource, tagTones))
    return foldedMarkdown(block.fold, arrangedBlockMarkdown(block, children))
  }
  return foldedBlockMarkdown(block, value, imageSource, tagTones)
}

/**
 * 本文の位置に描く `note` の種別 → 記法の class。ラベルは描く側が class から引く（`REPORT_NOTE_KINDS`）。注意・異常は筆を留める対象。
 * `memo` は傍注になる（`ReportLeafLayout` の傍注）。
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

function gutterNoteMarkdown({ label, text }: LeafGutterNote): string {
  const labelHtml = label === "" ? "" : `<span class="gutter-note-label">${label}</span>`
  return `<aside class="gutter-note">\n\n${labelHtml}${markdownInline(text)}\n\n</aside>`
}

function gutterGroupMarkdown(body: string, gutterNotes: readonly LeafGutterNote[]): string {
  if (gutterNotes.length === 0) {
    return body
  }
  return joinParts([
    '<div class="with-gutter">',
    body,
    joinParts(['<div class="gutter">', ...gutterNotes.map(gutterNoteMarkdown), "</div>"]),
    "</div>",
  ])
}

function foldedBlockMarkdown(
  block: ReportBlock,
  value: LeafValue,
  imageSource: ReportImageSource,
  tagTones: TagTones,
): string {
  const ordinal = value.captionNumber.kind === "none" ? 0 : value.captionNumber.ordinal
  return foldedMarkdown(block.fold, blockMarkdown(block, imageSource, ordinal, tagTones))
}

function foldedMarkdown(fold: string, markdown: string): string {
  return fold.trim() === "" || markdown.trim() === ""
    ? markdown
    : `<details><summary>${htmlInline(fold)}</summary>\n\n${markdown}\n\n</details>`
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
    case "plot":
      return plotMarkdown(block, ordinal, tagTones)
    case "compare":
      return compareMarkdown(block, ordinal)
    case "beforeAfter":
      return beforeAfterMarkdown(block, imageSource, ordinal)
    case "note":
      return block.tone === "memo" || block.text.trim() === ""
        ? ""
        : `<div class="${NOTE_CLASSES[block.tone]}">\n\n${markdownInline(block.text)}\n\n</div>`
    case "quote":
      return quoteMarkdown(block)
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
    case "graph": {
      const drawing = graphDrawingOf(block)
      switch (drawing.kind) {
        case "chain":
          return captionedMarkdown({
            kind: "figure",
            ordinal,
            title: block.title,
            body: `${cardChainHtml(drawing.chain)}${graphLegendMarkdown(block, false)}`,
            bodyFormat: "html",
            fit: false,
          })
        case "fold":
          return captionedMarkdown({
            kind: "figure",
            ordinal,
            title: block.title,
            body: `${graphFoldHtml(drawing.figure)}${graphLegendMarkdown(block)}`,
            bodyFormat: "html",
            fit: true,
          })
        case "mermaid":
          return captionedMarkdown({
            kind: "figure",
            ordinal,
            title: block.title,
            body: joinParts([
              fencedMarkdown("mermaid", drawing.source),
              graphLegendMarkdown(block),
            ]),
            bodyFormat: "markdown",
            fit: false,
          })
      }
    }
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
    case "timeline":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: block.title,
        body: timelineHtml(block),
        bodyFormat: "html",
        fit: false,
      })
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

function quoteMarkdown(block: Extract<ReportBlock, { readonly kind: "quote" }>): string {
  if (block.text.trim() === "") {
    return ""
  }
  const text = `> ${markdownInline(block.text)}`
  return block.source.trim() === "" ? text : `${text}\n>\n> — ${markdownInline(block.source)}`
}

/**
 * `plot` を {@link plotDrawingOf} が決めた形で描く。
 * チャートは値と系列名を描く側に書かせる印をつけて既存の `chart` の経路で、そのほかは描画側が読むフェンスで描く。
 */
function plotMarkdown(block: ReportPlot, ordinal: number, tagTones: TagTones): string {
  const drawing = plotDrawingOf(block)
  switch (drawing.kind) {
    case "table":
      return plotTableMarkdown(block, ordinal, tagTones)
    case "chart":
      return plotFigureMarkdown(
        ordinal,
        drawing.chart.title,
        "chart",
        JSON.stringify(chartConfigOf(drawing.chart, { values: true })),
      )
    case "gauge":
      return plotFigureMarkdown(
        ordinal,
        drawing.gauge.title,
        drawing.gauge.kind === "bullet" ? "bullet" : "number-line",
        JSON.stringify(drawing.gauge),
      )
    case "scatter":
      return plotFigureMarkdown(
        ordinal,
        drawing.scatter.title,
        "scatter",
        JSON.stringify(drawing.scatter),
      )
    case "histogram":
      return plotFigureMarkdown(
        ordinal,
        drawing.histogram.title,
        "histogram",
        JSON.stringify(drawing.histogram),
      )
  }
}

function plotFigureMarkdown(ordinal: number, title: string, fence: string, spec: string): string {
  return captionedMarkdown({
    kind: "figure",
    ordinal,
    title,
    body: fencedMarkdown(fence, spec),
    bodyFormat: "markdown",
    fit: false,
  })
}

function plotTableMarkdown(block: ReportPlot, ordinal: number, tagTones: TagTones): string {
  return tableMarkdown(
    {
      kind: "table",
      title: block.question,
      columns: block.data.map((column) => column.name),
      rows: plotRows(block),
      rest: "",
      fold: block.fold,
      aside: block.aside,
    },
    ordinal,
    tagTones,
  )
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
