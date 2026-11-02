// 図の部品（質問の添え書きが運ぶ `FigureBlock`）の節の並びから Markdown を組む決まり。

import { zip } from "remeda"

import { encodeMarks } from "../../../../../shared/report/code-mark.ts"
import {
  foldedMarkdown,
  gutterGroupMarkdown,
  sectionHeadingMarkdown,
} from "../../../../../shared/report/drawn-entry-markdown.ts"
import type { FigureBlock } from "../../../../../shared/report/report-block.ts"
import { captionedMarkdown } from "../../../../../shared/report/report-caption.ts"
import {
  imageMarkdown,
  type ReportImageSource,
} from "../../../../../shared/report/report-image-markdown.ts"
import { fencedMarkdown, joinParts } from "../../../../../shared/report/report-inline-markdown.ts"
import {
  type LeafValue,
  reportLeafLayoutOf,
} from "../../../../../shared/report/report-leaf-value.ts"
import { type TagTones, tableMarkdown } from "../../../../../shared/report/report-table-markdown.ts"
import { cardChainHtml } from "./card-chain-markdown.ts"
import { graphDrawingOf } from "./graph-drawing.ts"
import { graphFoldHtml } from "./graph-fold-html.ts"
import { compareMarkdown } from "./report-comparison-markdown.ts"
import { withSequenceAutonumber } from "./report-diagram-markdown.ts"
import { graphLegendMarkdown } from "./report-graph-markdown.ts"
import { listMarkdown } from "./report-list-markdown.ts"

/**
 * 節の並びを1つの Markdown に組む。空の塊・空の節は置かず、節の間は空行で区切る。
 * 題の番号は節をまたいで並びの順に数える。塊の `aside` は欄外注になり、その塊と一緒に包む（{@link gutterGroupMarkdown}）。
 */
export function reportSectionsMarkdown(
  sections: readonly { readonly heading: string; readonly blocks: readonly FigureBlock[] }[],
  imageSource: ReportImageSource,
): string {
  const { tagTones, values } = reportLeafLayoutOf(sections)
  return joinParts(
    zip(sections, values).map(([section, sectionValues]) =>
      joinParts([
        sectionHeadingMarkdown(section.heading),
        ...zip(section.blocks, sectionValues).map(([block, value]) =>
          gutterGroupMarkdown(
            foldedBlockMarkdown(block, value, imageSource, tagTones),
            value.gutterNotes,
          ),
        ),
      ]),
    ),
  )
}

function foldedBlockMarkdown(
  block: FigureBlock,
  value: LeafValue,
  imageSource: ReportImageSource,
  tagTones: TagTones,
): string {
  const ordinal = value.captionNumber.kind === "none" ? 0 : value.captionNumber.ordinal
  return foldedMarkdown(block.fold, blockMarkdown(block, imageSource, ordinal, tagTones))
}

function blockMarkdown(
  block: FigureBlock,
  imageSource: ReportImageSource,
  ordinal: number,
  tagTones: TagTones,
): string {
  switch (block.kind) {
    case "list":
      return listMarkdown(block)
    case "table":
      return tableMarkdown(block, ordinal, tagTones)
    case "compare":
      return compareMarkdown(block, ordinal)
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
    case "image":
      return imageMarkdown(block, imageSource, ordinal)
  }
}

/**
 * `code` の塊のフェンスの info。先頭の語は言語として読まれるので、言語が空でパスか印があるときは `text` で埋める
 * （埋めないとパスや印の語が言語になり、`marks` が描画側へ届かない）。
 */
function codeInfo(block: Extract<FigureBlock, { readonly kind: "code" }>): string {
  const rest = [block.path, block.marks.length === 0 ? "" : encodeMarks(block.marks)].filter(
    (part) => part.trim() !== "",
  )
  const language = block.language.trim() === "" && rest.length > 0 ? "text" : block.language
  return [language, ...rest].filter((part) => part.trim() !== "").join(" ")
}
