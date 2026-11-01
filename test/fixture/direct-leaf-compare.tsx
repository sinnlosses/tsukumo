// 葉を直接描く部品の出力を、図の塊を質問の添え書きと同じ `reportSectionsMarkdown` で Markdown にして `Markdown` で描いた出力と突き合わせる道具。
// 空白だけの違い（Markdown の改行の文字）は畳んで比べる。

import { cleanup, render, type RenderResult } from "@testing-library/react"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { Markdown } from "../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import { reportSectionsMarkdown } from "../../src/browser/components/page/conversation/domain/report-markdown.ts"
import type { A2uiReportComponent } from "../../src/shared/report/a2ui-report-catalog.ts"
import type { FigureBlock, ReportBlock } from "../../src/shared/report/report-block.ts"
import type { ReportImageSource } from "../../src/shared/report/report-image-markdown.ts"
import { type LeafValue, reportLeafLayoutOf } from "../../src/shared/report/report-leaf-value.ts"

const NO_IMAGES = { kind: "none" } as const

/** 塊1つだけの節。 */
function sectionOf<Block extends ReportBlock>(block: Block) {
  return [{ heading: "", blocks: [block] }] as const
}

/** 空白だけの違いと、属性の並びの違いは畳む。 */
export function normalized(html: string): string {
  return html
    .replace(/>\s+</g, "><")
    .replace(/<(\w+)((?:\s+[^\s=>]+(?:="[^"]*")?)+)>/g, (_, tag: string, attributes: string) => {
      const sorted = (attributes.match(/[^\s=>]+(?:="[^"]*")?/g) ?? []).toSorted()
      return `<${tag} ${sorted.join(" ")}>`
    })
    .trim()
}

/**
 * text ノードの字を文書の順に並べる（改行だけの text ノードは除く）。
 * 同じ `innerHTML` でも text ノードが割れていると字の送りが半画素ずれるので、割れ方も突き合わせる。
 */
export function textNodesOf(node: Node): readonly string[] {
  return [...node.childNodes].flatMap((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ""
      return /^\s*$/.test(text) && text.includes("\n") ? [] : [text]
    }
    return textNodesOf(child)
  })
}

type Rendered = { readonly html: string; readonly textNodes: readonly string[] }

function readRendered(container: HTMLElement): Rendered {
  const rendered = { html: normalized(container.innerHTML), textNodes: textNodesOf(container) }
  cleanup()
  return rendered
}

function renderOld(block: FigureBlock, imageSource: ReportImageSource): Rendered {
  const text = reportSectionsMarkdown(sectionOf(block), imageSource)
  const { container } = render(
    <div data-report-region="section">
      <Markdown text={text} />
    </div>,
  )
  return readRendered(container)
}

function renderNew(
  block: ReportBlock,
  part: A2uiReportComponent,
  imageSource: ReportImageSource,
): Rendered {
  const view = directLeafViewOf(part)
  const value = reportLeafLayoutOf(sectionOf(block)).values[0]?.[0]
  if (view === undefined) {
    throw new Error(`直接描く部品が無い: ${part.component}`)
  }
  const { container } = render(
    <div data-report-region="section">
      <DirectLeaf part={part} value={value} imageSource={imageSource} view={view} />
    </div>,
  )
  return readRendered(container)
}

/** 番号も傍注も無い葉の値。 */
export const PLAIN_LEAF_VALUE = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
} as const satisfies LeafValue

/** 部品1つを欄の直接の子として直接描く。片付けは呼ぶ側の `cleanup`。 */
export function renderDirectLeaf(
  part: A2uiReportComponent,
  imageSource: ReportImageSource = NO_IMAGES,
  value: LeafValue = PLAIN_LEAF_VALUE,
): RenderResult {
  const view = directLeafViewOf(part)
  if (view === undefined) {
    throw new Error(`直接描く部品が無い: ${part.component}`)
  }
  return render(
    <div data-report-region="section">
      <DirectLeaf part={part} value={value} imageSource={imageSource} view={view} />
    </div>,
  )
}

/** 図の塊を Markdown にして描いたもの（欄の直接の子）の `innerHTML`。 */
export function oldLeafHtml(
  block: FigureBlock,
  imageSource: ReportImageSource = NO_IMAGES,
): string {
  return renderOld(block, imageSource).html
}

/** 新しい描画（部品が直接描く）の `innerHTML`。`part` は `block` と同じ中身の部品。 */
export function newLeafHtml(
  block: ReportBlock,
  part: A2uiReportComponent,
  imageSource: ReportImageSource = NO_IMAGES,
): string {
  return renderNew(block, part, imageSource).html
}

/** 図の塊を Markdown にして描いたものの text ノードの字の並び。 */
export function oldLeafTextNodes(block: FigureBlock): readonly string[] {
  return renderOld(block, NO_IMAGES).textNodes
}

/** 新しい描画の text ノードの字の並び。 */
export function newLeafTextNodes(block: ReportBlock, part: A2uiReportComponent): readonly string[] {
  return renderNew(block, part, NO_IMAGES).textNodes
}
