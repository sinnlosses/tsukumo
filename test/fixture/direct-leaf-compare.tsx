// 葉を直接描く部品の出力を、旧い描画（塊 → Markdown → `Markdown`）の出力と突き合わせる道具。
// 空白だけの違い（Markdown の改行の文字）は畳んで比べる。

import { cleanup, render } from "@testing-library/react"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { Markdown } from "../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import type { A2uiReportComponent } from "../../src/shared/report/a2ui-report-catalog.ts"
import type { SectionBlock } from "../../src/shared/report/report-block.ts"
import type { ReportImageSource } from "../../src/shared/report/report-image-markdown.ts"
import { reportLeafLayoutOf } from "../../src/shared/report/report-leaf-value.ts"
import { reportSectionPieces } from "../../src/shared/report/report-markdown.ts"

const NO_IMAGES = { kind: "none" } as const

/** 塊1つだけの節。 */
function sectionOf(block: SectionBlock) {
  return [{ heading: "", shapeTag: "unspecified", blocks: [block] }] as const
}

/** 空白だけの違いと、属性の並びの違いは畳む。 */
function normalized(html: string): string {
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
function textNodesOf(node: Node): readonly string[] {
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

function renderOld(block: SectionBlock, imageSource: ReportImageSource): Rendered {
  const text = reportSectionPieces(sectionOf(block), imageSource)[0]?.blocks[0] ?? ""
  const { container } = render(
    <div data-report-region="section">
      <Markdown text={text} />
    </div>,
  )
  return readRendered(container)
}

function renderNew(
  block: SectionBlock,
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

/** 旧い描画（欄の直接の子）の `innerHTML`。 */
export function oldLeafHtml(
  block: SectionBlock,
  imageSource: ReportImageSource = NO_IMAGES,
): string {
  return renderOld(block, imageSource).html
}

/** 新しい描画（部品が直接描く）の `innerHTML`。`part` は `block` と同じ中身の部品。 */
export function newLeafHtml(
  block: SectionBlock,
  part: A2uiReportComponent,
  imageSource: ReportImageSource = NO_IMAGES,
): string {
  return renderNew(block, part, imageSource).html
}

/** 旧い描画の text ノードの字の並び。 */
export function oldLeafTextNodes(block: SectionBlock): readonly string[] {
  return renderOld(block, NO_IMAGES).textNodes
}

/** 新しい描画の text ノードの字の並び。 */
export function newLeafTextNodes(
  block: SectionBlock,
  part: A2uiReportComponent,
): readonly string[] {
  return renderNew(block, part, NO_IMAGES).textNodes
}
