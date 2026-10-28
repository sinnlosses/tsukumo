// 逃げ道（`Markdown` の部品）の中の記法の検出。
// 逃げ道を構文木（mdast）にして文書の順に辿り、ブラウザが記法として描く形だけを数える。
// HTML の容れ物（`<details>` / `<div>`）は木にならないので、深さは `html` ノードの中のタグを1つずつ数えて決める。

import type { Nodes } from "mdast"

import type { ReportBlock, ReportSection } from "../../../shared/report/report-block.ts"
import { leafBlocksOf } from "../../../shared/report/row-panel-block.ts"
import { markdownTreeOf, nodesInOrder } from "./markdown-tree.ts"

/** 逃げ道の中の記法 → 差し戻しの文面での呼び名と、代わりに使うもの。 */
export const MARKDOWN_NOTATION_NAMES = {
  heading: { written: "`#` / `##` の見出し", replacement: "節の `heading`" },
  table: { written: "表", replacement: "`Table`" },
  list: { written: "箇条書き", replacement: "`ItemList`" },
  note: { written: "class が `note` の要素", replacement: "`Note`（種別は `tone`）" },
  stats: { written: "class が `stats` の要素", replacement: "`Stats`" },
  code: { written: "フェンス", replacement: "`Code`" },
  mermaid: { written: "mermaid のフェンス", replacement: "`Mermaid`" },
  chart: { written: "`chart` のフェンス", replacement: "`Chart`" },
  image: { written: "画像（`![]()` / `<img>`）", replacement: "`Picture`" },
} as const satisfies Record<string, { readonly written: string; readonly replacement: string }>

/** 逃げ道の中に書くと差し戻す記法（塊の種類か節の見出しで書けるもの）。 */
export type MarkdownNotation = keyof typeof MARKDOWN_NOTATION_NAMES

export const MARKDOWN_NOTATIONS = Object.keys(MARKDOWN_NOTATION_NAMES).filter(
  (name): name is MarkdownNotation => name in MARKDOWN_NOTATION_NAMES,
)

/**
 * 塊の無い記法（塊に当てはまらない記法）。
 * `colsCard` は表から外したあとも、書かれ続けるかを見るために数える。
 * `dl` は表から外して `list` の `label` で書かせるが、逃げ道に残る数を見るために数え続ける。
 */
export type EscapeNotation = (typeof ESCAPE_NOTATIONS)[number]

export const ESCAPE_NOTATIONS = [
  "colsCard",
  "svg",
  "dl",
  "quote",
  "hr",
  "details",
] as const satisfies readonly string[]

/** `markdownNotationKinds` にだけ数える記法（`escapeNotations` の欄には入れない）。 */
const MARKDOWN_ONLY_KINDS = ["badge"] as const satisfies readonly string[]

type MarkdownOnlyKind = (typeof MARKDOWN_ONLY_KINDS)[number]

/** 逃げ道の外側（HTML の容れ物の中でないところ）に出た記法の種類（重複無し）。 */
export function notationsInSections(
  sections: readonly ReportSection[],
): readonly MarkdownNotation[] {
  return markdownNotationsAt(sections, false)
}

/**
 * 逃げ道の HTML の容れ物（`<details>` / `<div>`）の中に出た記法の種類（重複無し）。
 * 複数の塊を畳む・`cols` に並べるのは逃げ道の役目なので、ここに出ても差し戻さない。
 */
export function containedNotationsInSections(
  sections: readonly ReportSection[],
): readonly MarkdownNotation[] {
  return markdownNotationsAt(sections, true)
}

/** 逃げ道に出た、塊の無い記法の種類（重複無し）。容れ物の中か外かは問わない。 */
export function escapeNotationsInSections(
  sections: readonly ReportSection[],
): readonly EscapeNotation[] {
  const readings = readingsOf(sections)
  return ESCAPE_NOTATIONS.filter((notation) =>
    readings.some((reading) => reading.escapes.includes(notation)),
  )
}

/** `Markdown` の部品の中身に出た記法の種類（重複無し）。容れ物の中か外かは問わず、塊のある記法と塊の無い記法を合わせる。 */
export function notationKindsInMarkdowns(
  markdowns: readonly string[],
): readonly (MarkdownNotation | EscapeNotation | MarkdownOnlyKind)[] {
  const readings = markdowns.map(markdownReadingOf)
  return [
    ...MARKDOWN_NOTATIONS.filter((notation) =>
      readings.some((reading) => reading.placed.some((placed) => placed.notation === notation)),
    ),
    ...[...ESCAPE_NOTATIONS, ...MARKDOWN_ONLY_KINDS].filter((notation) =>
      readings.some((reading) => reading.escapes.includes(notation)),
    ),
  ]
}

/** `<details>` の中に `<details>` があるか、`fold` を持つ塊の中身に `<details>` があるか。 */
export function hasNestedFold({
  fold,
  markdown,
}: Pick<Extract<ReportBlock, { readonly kind: "markdown" }>, "fold" | "markdown">): boolean {
  const reading = markdownReadingOf(markdown)
  return reading.nestedDetails || (fold.trim() !== "" && reading.escapes.includes("details"))
}

/** 逃げ道1つに出た記法。`placed` は塊のある記法と、それが容れ物の中にあるか。 */
type MarkdownReading = {
  readonly placed: readonly { readonly notation: MarkdownNotation; readonly inContainer: boolean }[]
  readonly escapes: readonly (EscapeNotation | MarkdownOnlyKind)[]
  readonly nestedDetails: boolean
}

/** 文書の順に並べた、深さを変える印と記法の印。 */
type Mark =
  | { readonly kind: "notation"; readonly notation: MarkdownNotation }
  | { readonly kind: "escape"; readonly notation: EscapeNotation | MarkdownOnlyKind }
  | { readonly kind: "open"; readonly details: boolean }
  | { readonly kind: "close"; readonly details: boolean }

/** HTML のタグ1つ（開きか閉じ）。 */
const HTML_TAG = /<(\/?)([A-Za-z][\w-]*)([^>]*)>?/g

/** 容れ物として深さを数える要素。 */
const CONTAINER_TAGS: readonly string[] = ["details", "div"]

function markdownNotationsAt(
  sections: readonly ReportSection[],
  inContainer: boolean,
): readonly MarkdownNotation[] {
  const readings = readingsOf(sections)
  return MARKDOWN_NOTATIONS.filter((notation) =>
    readings.some((reading) =>
      reading.placed.some(
        (placed) => placed.notation === notation && placed.inContainer === inContainer,
      ),
    ),
  )
}

function readingsOf(sections: readonly ReportSection[]): readonly MarkdownReading[] {
  return sections
    .flatMap((section) => leafBlocksOf(section.blocks))
    .flatMap((block) => (block.kind === "markdown" ? [markdownReadingOf(block.markdown)] : []))
}

function markdownReadingOf(markdown: string): MarkdownReading {
  const initial: MarkdownReading & { readonly depth: number; readonly detailsDepth: number } = {
    placed: [],
    escapes: [],
    nestedDetails: false,
    depth: 0,
    detailsDepth: 0,
  }
  const final = nodesInOrder(markdownTreeOf(markdown))
    .flatMap(marksOf)
    .reduce((state, mark) => {
      switch (mark.kind) {
        case "notation":
          return {
            ...state,
            placed: [...state.placed, { notation: mark.notation, inContainer: state.depth > 0 }],
          }
        case "escape":
          return { ...state, escapes: [...state.escapes, mark.notation] }
        case "open": {
          const detailsDepth = state.detailsDepth + (mark.details ? 1 : 0)
          return {
            ...state,
            depth: state.depth + 1,
            detailsDepth,
            nestedDetails: state.nestedDetails || detailsDepth >= 2,
          }
        }
        case "close":
          return {
            ...state,
            depth: Math.max(state.depth - 1, 0),
            detailsDepth: Math.max(state.detailsDepth - (mark.details ? 1 : 0), 0),
          }
      }
    }, initial)
  return { placed: final.placed, escapes: final.escapes, nestedDetails: final.nestedDetails }
}

function marksOf(node: Nodes): readonly Mark[] {
  switch (node.type) {
    case "heading":
      return node.depth <= 2 ? [{ kind: "notation", notation: "heading" }] : []
    case "table":
      return [{ kind: "notation", notation: "table" }]
    case "list":
      return [{ kind: "notation", notation: "list" }]
    case "code":
      return [
        {
          kind: "notation",
          notation: node.lang === "mermaid" ? "mermaid" : node.lang === "chart" ? "chart" : "code",
        },
      ]
    case "image":
    case "imageReference":
      return [{ kind: "notation", notation: "image" }]
    case "blockquote":
      return [{ kind: "escape", notation: "quote" }]
    case "thematicBreak":
      return [{ kind: "escape", notation: "hr" }]
    case "html":
      return [...node.value.matchAll(HTML_TAG)].flatMap((match) =>
        tagMarks(match[1] === "/", (match[2] ?? "").toLowerCase(), match[3] ?? ""),
      )
    default:
      return []
  }
}

function tagMarks(closing: boolean, name: string, attributes: string): readonly Mark[] {
  const container = CONTAINER_TAGS.includes(name)
  if (closing) {
    return container ? [{ kind: "close", details: name === "details" }] : []
  }
  const classes = [...attributes.matchAll(/class=["']([^"']*)["']/g)].flatMap((match) =>
    (match[1] ?? "").split(/\s+/),
  )
  return [
    ...(["note", "stats"] as const)
      .filter((notation) => classes.includes(notation))
      .map((notation): Mark => ({ kind: "notation", notation })),
    ...(name === "img" ? [{ kind: "notation", notation: "image" } as const] : []),
    ...(classes.includes("cols") || classes.includes("card")
      ? [{ kind: "escape", notation: "colsCard" } as const]
      : []),
    ...(classes.includes("badge") ? [{ kind: "escape", notation: "badge" } as const] : []),
    ...(name === "svg" || name === "dl" || name === "details"
      ? [{ kind: "escape", notation: name } as const]
      : []),
    ...(container ? [{ kind: "open", details: name === "details" } as const] : []),
  ]
}
