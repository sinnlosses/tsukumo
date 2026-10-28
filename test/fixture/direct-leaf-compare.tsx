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

/** 旧い描画（欄の直接の子）の `innerHTML`。 */
export function oldLeafHtml(
  block: SectionBlock,
  imageSource: ReportImageSource = NO_IMAGES,
): string {
  const text = reportSectionPieces(sectionOf(block), imageSource)[0]?.blocks[0] ?? ""
  const { container } = render(
    <div data-report-region="section">
      <Markdown text={text} />
    </div>,
  )
  const html = normalized(container.innerHTML)
  cleanup()
  return html
}

/** 新しい描画（部品が直接描く）の `innerHTML`。`part` は `block` と同じ中身の部品。 */
export function newLeafHtml(
  block: SectionBlock,
  part: A2uiReportComponent,
  imageSource: ReportImageSource = NO_IMAGES,
): string {
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
  const html = normalized(container.innerHTML)
  cleanup()
  return html
}
