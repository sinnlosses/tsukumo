// 内容部品を直接描く部品の出力を、図の部品を質問の添え書きと同じ `reportSectionsMarkdown` で Markdown にして `Markdown` で描いた出力と突き合わせる道具。
// 空白だけの違い（Markdown の改行の文字）は畳んで比べる。

import { cleanup, render, type RenderResult } from "@testing-library/react"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../src/browser/features/report/leaf/direct-leaf-view.tsx"
import { Markdown } from "../../src/browser/features/report/renderer/markdown-renderer.tsx"
import { reportSectionsMarkdown } from "../../src/browser/features/report/report-markdown.ts"
import type { A2uiReportComponent } from "../../src/shared/report/a2ui-report-catalog.ts"
import type { FigureBlock, LeafComponent } from "../../src/shared/report/report-block.ts"
import type { ReportImageSource } from "../../src/shared/report/report-image-markdown.ts"
import { type LeafValue, reportLeafLayoutOf } from "../../src/shared/report/report-leaf-value.ts"

const NO_IMAGES = { kind: "none" } as const

/** 塊1つだけの節。 */
function sectionOf<Block extends LeafComponent>(block: Block) {
  return [{ heading: "", blocks: [block] }] as const
}

/**
 * 表の系統で、直接描く側だけが持つ意匠の違い（旧い Markdown の経路は `Badge` を出せない）を畳む。
 * 要素の入れ子と字の割れ方は変えない（包みの外し方は子をそのまま親へ移すだけ）。
 */
function foldIntendedDifferences(html: string): string {
  const template = document.createElement("template")
  template.innerHTML = html
  const root = template.content
  for (const element of root.querySelectorAll(".report-captioned-table")) {
    element.classList.remove("report-captioned-table")
  }
  // Astryx の `Badge` は字を内側の1つの span で包むので、その包みも外す。
  for (const element of root.querySelectorAll(".astryx-badge")) {
    element.replaceChildren(...(element.firstElementChild?.childNodes ?? []))
  }
  for (const element of root.querySelectorAll(
    ".report-change-to, .report-table-status-legend .astryx-badge",
  )) {
    element.replaceWith(...element.childNodes)
  }
  for (const element of root.querySelectorAll(".report-table-status-legend-swatch")) {
    element.remove()
  }
  for (const element of root.querySelectorAll(".report-table-status-legend [aria-hidden]")) {
    element.removeAttribute("aria-hidden")
  }
  for (const element of root.querySelectorAll(".report-table-status-legend[aria-hidden]")) {
    element.removeAttribute("aria-hidden")
  }
  for (const element of root.querySelectorAll(".astryx-badge")) {
    const isCellBadge = [...element.classList].some((name) => name.includes("table-cell-badge"))
    element.classList.remove(
      ...[...element.classList].filter(
        (name) =>
          name === "astryx-badge" || /^x[0-9a-z]+$/.test(name) || name.includes("table-cell-badge"),
      ),
    )
    if (isCellBadge) {
      element.classList.add("report-cell-status")
    }
    element.removeAttribute("data-tone")
    element.removeAttribute("data-shape")
    element.removeAttribute("data-variant")
  }
  for (const element of root.querySelectorAll("[class*='report-cell-status-']")) {
    element.classList.remove(
      "report-cell-status-ok",
      "report-cell-status-warn",
      "report-cell-status-ng",
    )
  }
  return template.innerHTML
}

/** 空白だけの違いと、属性の並びの違いは畳む。表の系統の意図した意匠の違いも畳む。 */
export function normalized(html: string): string {
  return foldIntendedDifferences(html)
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
  block: LeafComponent,
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

/** 番号も欄外注も無い内容部品の値。 */
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

/** 図の部品を Markdown にして描いたもの（欄の直接の子）の `innerHTML`。 */
export function oldLeafHtml(
  block: FigureBlock,
  imageSource: ReportImageSource = NO_IMAGES,
): string {
  return renderOld(block, imageSource).html
}

/** 新しい描画（部品が直接描く）の `innerHTML`。`part` は `block` と同じ中身の部品。 */
export function newLeafHtml(
  block: LeafComponent,
  part: A2uiReportComponent,
  imageSource: ReportImageSource = NO_IMAGES,
): string {
  return renderNew(block, part, imageSource).html
}

/** 図の部品を Markdown にして描いたものの text ノードの字の並び。 */
export function oldLeafTextNodes(block: FigureBlock): readonly string[] {
  return renderOld(block, NO_IMAGES).textNodes
}

/** 新しい描画の text ノードの字の並び。 */
export function newLeafTextNodes(
  block: LeafComponent,
  part: A2uiReportComponent,
): readonly string[] {
  return renderNew(block, part, NO_IMAGES).textNodes
}
