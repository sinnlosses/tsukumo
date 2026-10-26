// 見比べる塊（`compare`・`beforeAfter`）を Markdown と HTML に組む。

import type { ReportBlock } from "./report-block.ts"
import { captionedMarkdown } from "./report-caption.ts"
import { svgHtml } from "./report-diagram-markdown.ts"
import { reportImageAttributes, type ReportImageSource } from "./report-image-markdown.ts"
import { formatImageRegion, IMAGE_REGION_ATTRIBUTE } from "./report-image.ts"
import {
  fencedMarkdown,
  htmlAttribute,
  htmlInlineWithCode,
  joinParts,
} from "./report-inline-markdown.ts"

/** 2つの側を、見出しと箇条の札にして横に並べる。 */
export function compareMarkdown(
  block: Extract<ReportBlock, { readonly kind: "compare" }>,
  ordinal: number,
): string {
  const sides = block.sides.map(({ heading, points }) => {
    const items = points.map((point) => `<li>${htmlInlineWithCode(point)}</li>`).join("")
    return `<div class="compare-side"><div class="compare-heading">${htmlInlineWithCode(heading)}</div><ul>${items}</ul></div>`
  })
  return captionedMarkdown({
    kind: "figure",
    ordinal,
    title: block.title,
    body: `<div class="compare">${sides.join("")}</div>`,
    bodyFormat: "html",
    fit: false,
  })
}

type BeforeAfterBlock = Extract<ReportBlock, { readonly kind: "beforeAfter" }>

type BeforeAfterSide = BeforeAfterBlock["before"]

/** 前と後の側の、見出しの文字と見出しの class。 */
const BEFORE_AFTER_SIDES = {
  before: { label: "前", labelClass: "before-after-label" },
  after: { label: "後", labelClass: "before-after-label before-after-label-after" },
} as const satisfies Record<
  "before" | "after",
  { readonly label: string; readonly labelClass: string }
>

/**
 * 前の側・矢印・後の側を横に並べる。側の中身はコードのフェンスを含みうるので、容れ物の HTML と中身を空行で区切って組む。
 * 矢印は飾りで、どちらが前かは見出しの文字が言う。
 */
export function beforeAfterMarkdown(
  block: BeforeAfterBlock,
  imageSource: ReportImageSource,
  ordinal: number,
): string {
  const side = (position: keyof typeof BEFORE_AFTER_SIDES, content: BeforeAfterSide): string => {
    const { label, labelClass } = BEFORE_AFTER_SIDES[position]
    return joinParts([
      '<div class="before-after-side">',
      `<div class="${labelClass}">${label}</div>`,
      beforeAfterContentMarkdown(content, imageSource, `${label}の画面`, block.title),
      "</div>",
    ])
  }
  return captionedMarkdown(
    {
      kind: "figure",
      ordinal,
      title: block.title,
      body: joinParts([
        '<div class="before-after">',
        side("before", block.before),
        '<div class="before-after-arrow" aria-hidden="true">→</div>',
        side("after", block.after),
        "</div>",
      ]),
      bodyFormat: "markdown",
      fit: false,
    },
    block.before.kind === "image" && block.after.kind === "image",
  )
}

function beforeAfterContentMarkdown(
  content: BeforeAfterSide,
  imageSource: ReportImageSource,
  imageLabel: string,
  title: string,
): string {
  switch (content.kind) {
    case "image": {
      const alt = title.trim() === "" ? imageLabel : `${imageLabel}: ${title}`
      const region =
        content.region === undefined
          ? ""
          : ` ${IMAGE_REGION_ATTRIBUTE}="${formatImageRegion(content.region)}"`
      return `<img${reportImageAttributes(imageSource, content.path)} alt="${htmlAttribute(alt)}"${region}>`
    }
    case "code":
      return fencedMarkdown(content.language, content.source)
    case "points":
      return `<ul>${content.points.map((point) => `<li>${htmlInlineWithCode(point)}</li>`).join("")}</ul>`
    case "mermaid":
      return fencedMarkdown("mermaid", content.source)
    case "svg":
      return svgHtml(content)
  }
}
