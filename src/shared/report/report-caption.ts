// 塊の本体に、節をまたいで数えた「図 n」「表 n」の題の行を添えて包む。

import { htmlInlineWithCode } from "./report-inline-markdown.ts"

/** 題に番号を振る塊の分類。図は題が本体の下、表は題が本体の上。 */
export type CaptionKind = "figure" | "table"

const CAPTION_LABELS = {
  figure: "図",
  table: "表",
} satisfies Record<CaptionKind, string>

type Captioned = {
  readonly kind: CaptionKind
  readonly ordinal: number
  readonly title: string
  readonly body: string
  /** `html` の本体は空行を挟まずに包み、`markdown` の本体（表・フェンス）は空行で区切って包む。 */
  readonly bodyFormat: "html" | "markdown"
  /** 本体の幅に包みを縮める。本体が親の幅を取る塊（グラフ・見比べ）は縮めない。 */
  readonly fit: boolean
}

/**
 * 本体と、番号つきの題の行を包む。表は題が本体の上、図は本体の下。
 * `swap` は包みに、見せ方（並べる・切り替え）を選ぶ口の印（`before-after-swap`）を付ける。
 */
export function captionedMarkdown(
  { kind, ordinal, title, body, bodyFormat, fit }: Captioned,
  swap = false,
): string {
  const text = htmlInlineWithCode(title)
  const caption =
    `<div class="caption"><span class="caption-number">${CAPTION_LABELS[kind]} ${String(ordinal)}</span>` +
    `${text === "" ? "" : `<span class="caption-text">${text}</span>`}</div>`
  const parts = kind === "table" ? [caption, body] : [body, caption]
  const className = [
    "captioned",
    ...(fit ? ["captioned-fit"] : []),
    ...(swap ? ["before-after-swap"] : []),
  ].join(" ")
  return bodyFormat === "html"
    ? `<div class="${className}">${parts.join("")}</div>`
    : `<div class="${className}">\n\n${parts.join("\n\n")}\n\n</div>`
}
