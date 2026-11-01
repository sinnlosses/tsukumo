// 見比べる塊（`compare`）を Markdown と HTML に組み、前後（`beforeAfter`）の画像の代替テキストを決める。

import type { ReportBlock } from "../../../../../shared/report/report-block.ts"
import { captionedMarkdown } from "../../../../../shared/report/report-caption.ts"
import { htmlInlineWithCode } from "../../../../../shared/report/report-inline-markdown.ts"

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

/** 前後の画像の代替テキスト。`imageLabel` は「前の画面」「後の画面」で、題があれば続ける。 */
export function beforeAfterImageAltOf(imageLabel: string, title: string): string {
  return title.trim() === "" ? imageLabel : `${imageLabel}: ${title}`
}
