import type { ReportBlock, ReportSection } from "../../src/shared/report/report-block.ts"
import type { ReportImageSource } from "../../src/shared/report/report-image-markdown.ts"
import { reportSectionsMarkdown } from "../../src/shared/report/report-markdown.ts"

export const NO_IMAGES = { kind: "none" } as const satisfies ReportImageSource

export const section = (blocks: readonly ReportBlock[], heading = ""): ReportSection => ({
  heading,
  shapeTag: "unspecified",
  blocks,
})
export const markdownOf = (block: ReportBlock): string =>
  reportSectionsMarkdown([section([block])], NO_IMAGES)
export const text = (value: string): ReportBlock => ({
  kind: "text",
  text: value,
  fold: "",
  aside: "",
})
export const captionRow = (label: "図" | "表", ordinal: number, title = ""): string =>
  `<div class="caption"><span class="caption-number">${label} ${String(ordinal)}</span>` +
  `${title === "" ? "" : `<span class="caption-text">${title}</span>`}</div>`
/** 図の包み。本体が HTML だけなら空行を挟まず、題の行は本体のあと。 */
export const figureCaptioned = (body: string, title = "", ordinal = 1, fit = true): string =>
  `<div class="captioned${fit ? " captioned-fit" : ""}">${body}${captionRow("図", ordinal, title)}</div>`
/** 図の包み（本体が Markdown のフェンスで、空行で区切る）。 */
export const fencedFigureCaptioned = (body: string, title = "", ordinal = 1): string =>
  `<div class="captioned">\n\n${body}\n\n${captionRow("図", ordinal, title)}\n\n</div>`
export const GRAPH_SHAPE_LEGEND =
  '<div class="graph-legend">' +
  [
    ["round", "入口・出口"],
    ["box", "処理"],
    ["decision", "分岐"],
  ]
    .map(
      ([shape, label]) =>
        `<span class="graph-legend-item"><span class="graph-legend-shape graph-legend-shape-${shape}" aria-hidden="true"></span>${label}</span>`,
    )
    .join("") +
  "</div>"
export type StatItem = Extract<ReportBlock, { readonly kind: "stats" }>["items"][number]
export const graphMarkdown = (
  source: string,
  title = "",
  legend: Extract<ReportBlock, { readonly kind: "graph" }>["legend"] = [],
): string =>
  markdownOf({ kind: "graph", title, direction: "LR", legend, source, fold: "", aside: "" })
export const statItem: StatItem = {
  before: "",
  value: "",
  total: "",
  label: "",
  series: [],
  better: "",
}
export const statsCaptioned = (body: string, ordinal = 1): string =>
  figureCaptioned(body, "", ordinal, false)
/** 図の包みから、本体のフェンスだけを取り出す。 */
export const chartFenceOf = (block: ReportBlock): string =>
  markdownOf(block)
    .replace(/^<div class="captioned">\n\n/, "")
    .replace(/\n\n<div class="caption">.*<\/div>\n\n<\/div>$/, "")
export const captionNumbers = (sections: readonly ReportSection[]): string[] =>
  [...reportSectionsMarkdown(sections, NO_IMAGES).matchAll(/class="caption-number">([^<]+)</g)].map(
    ([, label]) => label ?? "",
  )
/** 表の包み。題の行は本体の前、本体のあとに空行で閉じる。 */
export const tableCaptioned = (body: string, title = "", ordinal = 1): string =>
  `<div class="captioned captioned-fit">\n\n${captionRow("表", ordinal, title)}\n\n${body}\n\n</div>`
