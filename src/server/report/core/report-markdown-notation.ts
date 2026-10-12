// 逃げ道（`markdown` の塊）の中の記法の検出。
// Markdown として構文解析せず、行で見る（フェンスの中だけは飛ばす）。
// 描く側のパーサはブラウザの層にあって使えず、判定に要るのは行頭の形と数えられる印だけなので。

import type { ReportSection } from "../../../shared/report/report-block.ts"
import { closesFence, openingFence } from "../../../shared/report/report-fence.ts"

/** 逃げ道の中の記法 → 差し戻しの文面での呼び名と、代わりに使うもの。 */
export const MARKDOWN_NOTATION_NAMES = {
  heading: { written: "`#` / `##` の見出し", replacement: "節の `heading`" },
  table: { written: "表", replacement: "`table` の塊" },
  list: { written: "箇条書き", replacement: "`list` の塊" },
  note: { written: "`note` の塊", replacement: "`note` の塊（種別は `tone`）" },
  stats: { written: "`stats` の塊", replacement: "`stats` の塊" },
  progress: { written: "`progress` の塊", replacement: "`progress` の塊" },
  code: { written: "フェンス", replacement: "`code` の塊" },
  mermaid: { written: "mermaid のフェンス", replacement: "`mermaid` の塊" },
  chart: { written: "`chart` のフェンス", replacement: "`chart` の塊" },
  image: { written: "画像（`![]()` / `<img>`）", replacement: "`image` の塊" },
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

/** 逃げ道に出た、塊の無い記法の種類（重複無し）。 */
export function escapeNotationsInSections(
  sections: readonly ReportSection[],
): readonly EscapeNotation[] {
  const markdowns = markdownsOf(sections)
  return ESCAPE_NOTATIONS.filter((notation) =>
    markdowns.some((markdown) => hasEscapeNotation(markdown, notation)),
  )
}

/**
 * 逃げ道の中身を、フェンスの外の行とフェンスの並びに分ける。
 * `outside` は行の並びを保つため、フェンスの行（開き・中身・閉じ）を空行に置き換えて残す。閉じの無いフェンスは末尾まで続く。
 */
export function splitFences(markdown: string): SplitMarkdown {
  type Open = Fence & { readonly marker: string }
  const initial: {
    readonly outside: readonly string[]
    readonly fences: readonly Fence[]
    readonly open: Open | undefined
  } = { outside: [], fences: [], open: undefined }

  const final = markdown.split("\n").reduce((state, line) => {
    const open = state.open
    if (open !== undefined) {
      return closesFence(line, open.marker)
        ? {
            outside: [...state.outside, ""],
            fences: [...state.fences, fenceOf(open)],
            open: undefined,
          }
        : {
            ...state,
            outside: [...state.outside, ""],
            open: { ...open, content: [...open.content, line] },
          }
    }
    const opening = openingFence(line)
    if (opening === undefined) {
      return { ...state, outside: [...state.outside, line] }
    }
    return {
      ...state,
      outside: [...state.outside, ""],
      open: {
        marker: opening.marker,
        info: opening.info,
        content: [],
        line: state.outside.length,
      },
    }
  }, initial)

  return {
    outside: final.outside,
    fences: final.open === undefined ? final.fences : [...final.fences, fenceOf(final.open)],
  }
}

/**
 * 地の文の段落。HTML の塊（`<details>` / `<div>`）の中は数えない（4文以上の段落の逃げ先が `<details>` なので）。
 * 段落は空行か、地の文でない行で切れる。
 */
export function paragraphs(lines: readonly string[]): readonly string[] {
  const initial: {
    readonly done: readonly string[]
    readonly current: readonly string[]
    readonly depth: number
  } = { done: [], current: [], depth: 0 }

  const flushed = (state: typeof initial): readonly string[] =>
    state.current.length === 0 ? state.done : [...state.done, state.current.join("")]

  const final = lines.reduce((state, line) => {
    const depth = Math.max(
      state.depth + countMatches(line, HTML_BLOCK_OPEN) - countMatches(line, HTML_BLOCK_CLOSE),
      0,
    )
    const prose =
      state.depth === 0 && depth === 0 && line.trim() !== "" && !NON_PROSE_LINE.test(line)
    return prose
      ? { ...state, current: [...state.current, line.trim()], depth }
      : { done: flushed(state), current: [], depth }
  }, initial)

  return flushed(final)
}

export function hasNestedFold(fold: string, { outside }: SplitMarkdown): boolean {
  const opens = outside.reduce(
    (state, line) => {
      const opened = countMatches(line, /<details\b/g)
      return {
        depth: Math.max(state.depth + opened - countMatches(line, /<\/details>/g), 0),
        nested: state.nested || state.depth + opened >= 2,
      }
    },
    { depth: 0, nested: false },
  )
  return opens.nested || (fold.trim() !== "" && outside.some((line) => DETAILS_TAG.test(line)))
}

/** 逃げ道（`markdown` の塊）の中身を、塊ごとにフェンスの外の行とフェンスの並びに分けたもの。 */
function markdownsOf(sections: readonly ReportSection[]): readonly SplitMarkdown[] {
  return sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => (block.kind === "markdown" ? [splitFences(block.markdown)] : []))
}

/** Markdown の画像（`![…](`）か `<img>` のタグ。 */
const IMAGE_NOTATION = /!\[[^\]]*\]\(|<img\b/i

/** `#` / `##` の見出し（CommonMark の ATX 見出し。行頭の空白は3つまで）。`###` は節の下の段で、塊の種類が無い。 */
const SECTION_HEADING = /^ {0,3}#{1,2}(?:[ \t]|$)/

/** 箇条書き・番号付きリスト・チェックリストの項目の頭。 */
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]/

/** 表の区切りの行（`| --- | :---: |`）。`|` を1つ以上含み、セルは `-` と両端の `:` だけ。 */
const TABLE_DELIMITER = /^ *\|?(?: *:?-+:? *\|)+(?: *:?-+:? *)?$|^ *:?-+:? *\|(?: *:?-+:? *\|?)*$/

/** 地の文の段落にしない行の頭（見出し・表・引用・箇条書き・番号・HTML・区切り線）。 */
const NON_PROSE_LINE = /^ *(?:#|\||>|[-*+] |\d+[.)] |<|---|\*\*\*|___)/

/** HTML の塊の開き・閉じ（入れ子の深さを数える要素）。 */
const HTML_BLOCK_OPEN = /<(?:details|div)\b/g
const HTML_BLOCK_CLOSE = /<\/(?:details|div)>/g

/** 塊の無い記法の印。 */
const SVG_TAG = /<svg\b/
const DL_TAG = /<dl\b/
const DETAILS_TAG = /<details\b/
const QUOTE_LINE = /^ {0,3}>/
/** 水平線（CommonMark の thematic break。`-` / `*` / `_` のどれかを3つ以上、空白を挟んでもよい）。 */
const HR_LINE = /^ {0,3}(?:-[ \t]*){3,}$|^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$/

/**
 * フェンス1つ。`info` は開きの info 文字列の最初の語（無ければ空）、`line` は開きの行の位置。
 */
type Fence = { readonly info: string; readonly content: readonly string[]; readonly line: number }

/** 逃げ道の中身を、フェンスの外の行とフェンスの並びに分けたもの。 */
export type SplitMarkdown = {
  readonly outside: readonly string[]
  readonly fences: readonly Fence[]
}

function markdownNotationsAt(
  sections: readonly ReportSection[],
  inContainer: boolean,
): readonly MarkdownNotation[] {
  const markdowns = markdownsOf(sections)
  return MARKDOWN_NOTATIONS.filter((notation) =>
    markdowns.some((markdown) => hasNotation(markdown, notation, inContainer)),
  )
}

function fenceOf({ info, content, line }: Fence): Fence {
  return { info, content, line }
}

/**
 * その記法が、逃げ道の HTML の容れ物（`<details>` / `<div>`）の中と外のどちらにあるか。
 * `inContainer` が `false` なら外側だけ（差し戻しの判定はここ）、`true` なら中だけを見る。
 * 複数の塊を1つに畳む・`cols` に並べるのは逃げ道の役目なので、中は差し戻さない。
 */
function hasNotation(
  { outside, fences }: SplitMarkdown,
  notation: MarkdownNotation,
  inContainer: boolean,
): boolean {
  const topLevel = topLevelFlags(outside)
  const atLevel = (index: number): boolean => topLevel[index] === !inContainer
  const lines = outside.filter((_, index) => atLevel(index))
  const levelFences = fences.filter((fence) => atLevel(fence.line))
  switch (notation) {
    case "heading":
      return lines.some((line) => SECTION_HEADING.test(line))
    case "table":
      return outside.some(
        (line, index) =>
          atLevel(index) && line.includes("|") && TABLE_DELIMITER.test(outside[index + 1] ?? ""),
      )
    case "list":
      return lines.some((line) => LIST_ITEM.test(line))
    case "note":
    case "stats":
    case "progress":
      return lines.some((line) => classLists(line).some((classes) => classes.includes(notation)))
    case "code":
      return levelFences.some((fence) => fence.info !== "mermaid" && fence.info !== "chart")
    case "mermaid":
      return levelFences.some((fence) => fence.info === "mermaid")
    case "chart":
      return levelFences.some((fence) => fence.info === "chart")
    case "image":
      return lines.some((line) => IMAGE_NOTATION.test(line))
  }
}

/** 塊の無い記法があるか。フェンスの中は見ない。 */
function hasEscapeNotation({ outside }: SplitMarkdown, notation: EscapeNotation): boolean {
  switch (notation) {
    case "colsCard":
      return outside.some((line) =>
        classLists(line).some((classes) => classes.includes("cols") || classes.includes("card")),
      )
    case "svg":
      return outside.some((line) => SVG_TAG.test(line))
    case "dl":
      return outside.some((line) => DL_TAG.test(line))
    case "quote":
      return outside.some((line) => QUOTE_LINE.test(line))
    case "hr":
      return outside.some((line) => HR_LINE.test(line))
    case "details":
      return outside.some((line) => DETAILS_TAG.test(line))
  }
}

/** 行ごとに、その行の頭が HTML の塊の外にあるか。 */
function topLevelFlags(lines: readonly string[]): readonly boolean[] {
  return lines.reduce<{ readonly flags: readonly boolean[]; readonly depth: number }>(
    (state, line) => ({
      flags: [...state.flags, state.depth === 0],
      depth: Math.max(
        state.depth + countMatches(line, HTML_BLOCK_OPEN) - countMatches(line, HTML_BLOCK_CLOSE),
        0,
      ),
    }),
    { flags: [], depth: 0 },
  ).flags
}

/** 行に書かれた class の並びごとの名前（`class="note note-warn"` なら `["note", "note-warn"]`）。 */
function classLists(line: string): readonly (readonly string[])[] {
  return [...line.matchAll(/class=["']([^"']*)["']/g)].map((match) => (match[1] ?? "").split(/\s+/))
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length
}
