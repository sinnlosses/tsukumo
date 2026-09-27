// `report` ツールで受け取ったレポートの検査（「検査 → 整形 → 描画」の検査の段。
// `docs/display.md`「出力の分離（セリフと詳細）」）。
//
// 検査するのは「レポートの記法」（`REPORT_NOTATION_PROMPT`）の条のうち、機械で判定できるものだけ。
// 読み手によって結論が変わる条（効能書き・根拠の量・前置きと締めの行など）は入れない
// ——誤って差し戻すと、直しようのない指摘でモデルを1往復させることになる。
//
// 本文は節と塊の並びで届くので、塊の種類ごとに数える。逃げ道（`markdown` の塊）の中だけは
// Markdown として構文解析せず、行で見る（フェンスの中だけは飛ばす）。描く側の
// パーサ（`src/browser/`）とは層が違って使えず、判定に要るのは行頭の形と数えられる印だけなので。

import {
  type ReportBlock,
  REPORT_MERMAID_KINDS,
  type ReportSection,
} from "../../../shared/report/report-block.ts"
import type { ReportCheck } from "../../../shared/report/report-check.ts"

/** 検査にかけるレポート。`sections` と `checks` の「無い」は空の配列、`favor` の「無い」は空の文字列。 */
export type ReportDraft = {
  readonly conclusion: string
  readonly sections: readonly ReportSection[]
  readonly favor: string
  readonly checks: readonly ReportCheck[]
}

/** 逃げ道の中に書くと差し戻す記法（塊の種類か節の見出しで書けるもの）。 */
export type MarkdownNotation = keyof typeof MARKDOWN_NOTATION_NAMES

/**
 * 規約違反1つ。`count` は違反の数（文の数・塊の数）で、モデルが書いた文面は持たない
 * （差し戻しの文面に写さないため。会話の中身をモデルの文脈へ戻す経路を作らない）。
 */
export type ReportViolation =
  /** `conclusion` が3文以上ある（条1「冒頭の1〜2文で結論」）。 */
  | { readonly kind: "long-conclusion"; readonly count: number }
  /** 4文以上の地の文がある（「地の文の段落は3文まで」）。`count` は `text` の塊と逃げ道の段落の数。 */
  | { readonly kind: "long-paragraph"; readonly count: number }
  /** `mermaid` の塊に、規約が挙げる10種の外の種類がある。 */
  | { readonly kind: "unknown-mermaid"; readonly count: number }
  /** `note` の塊が3つ以上ある（「1つのレポートに1〜2個まで」）。 */
  | { readonly kind: "too-many-notes"; readonly count: number }
  /** 行のセルの数が `columns` と揃わない表がある。`count` は表の数。 */
  | { readonly kind: "ragged-table"; readonly count: number }
  /** 節が2つ以上あるのに見出しの無い節がある。`count` は見出しの無い節の数。 */
  | { readonly kind: "untitled-section"; readonly count: number }
  /**
   * 逃げ道の外側（HTML の塊の中でないところ）に、塊の種類がある記法を書いた。
   * `count` は記法の種類の数、`notations` はその種類。
   */
  | {
      readonly kind: "markdown-notation"
      readonly count: number
      readonly notations: readonly MarkdownNotation[]
    }

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

function markdownNotationsAt(
  sections: readonly ReportSection[],
  inContainer: boolean,
): readonly MarkdownNotation[] {
  const markdowns = markdownsOf(sections)
  return MARKDOWN_NOTATIONS.filter((notation) =>
    markdowns.some((markdown) => hasNotation(markdown, notation, inContainer)),
  )
}

/** 逃げ道（`markdown` の塊）の中身を、塊ごとにフェンスの外の行とフェンスの並びに分けたもの。 */
function markdownsOf(sections: readonly ReportSection[]): readonly SplitMarkdown[] {
  return sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => (block.kind === "markdown" ? [splitFences(block.markdown)] : []))
}

/**
 * 塊の無い記法（`REPORT_NOTATION_PROMPT` の表にある、塊に当てはまらない記法）。
 * `dl` は表から外して `list` の `label` で書かせるが、逃げ道に残る数を見るために数え続ける。
 */
export type EscapeNotation = (typeof ESCAPE_NOTATIONS)[number]

export const ESCAPE_NOTATIONS = [
  "colsCard",
  "chart",
  "svg",
  "dl",
  "quote",
  "hr",
  "details",
] as const satisfies readonly string[]

/** 逃げ道に出た、塊の無い記法の種類（重複無し）。 */
export function escapeNotationsInSections(
  sections: readonly ReportSection[],
): readonly EscapeNotation[] {
  const markdowns = markdownsOf(sections)
  return ESCAPE_NOTATIONS.filter((notation) =>
    markdowns.some((markdown) => hasEscapeNotation(markdown, notation)),
  )
}

/** レポートの規約違反を並べる。空なら違反は無い。 */
export function reportViolations(report: ReportDraft): readonly ReportViolation[] {
  const blocks = report.sections.flatMap((section) => section.blocks)
  const markdowns = blocks.flatMap((block) =>
    block.kind === "markdown" ? [splitFences(block.markdown)] : [],
  )
  const notations = notationsInSections(report.sections)

  const counted = [
    { kind: "long-conclusion", count: sentenceCount(report.conclusion) },
    {
      kind: "long-paragraph",
      count:
        blocks.filter(
          (block) =>
            block.kind === "text" && block.fold.trim() === "" && sentenceCount(block.text) > 3,
        ).length +
        markdowns
          .flatMap(({ outside }) => paragraphs(outside))
          .filter((paragraph) => sentenceCount(paragraph) > 3).length,
    },
    {
      kind: "unknown-mermaid",
      count: blocks.filter(
        (block) => block.kind === "mermaid" && !MERMAID_KINDS.has(mermaidKind(block.source)),
      ).length,
    },
    { kind: "too-many-notes", count: blocks.filter((block) => block.kind === "note").length },
    { kind: "ragged-table", count: blocks.filter((block) => isRaggedTable(block)).length },
    {
      kind: "untitled-section",
      count:
        report.sections.length < 2
          ? 0
          : report.sections.filter((section) => section.heading.trim() === "").length,
    },
    { kind: "markdown-notation", count: notations.length, notations },
  ] as const satisfies readonly ReportViolation[]

  return counted.filter((violation) => violation.count > VIOLATION_THRESHOLDS[violation.kind])
}

/**
 * 差し戻すときの `report` の戻り値。違反した条と直し方だけを1行ずつ並べ、画面の状態
 * （描けたか・どこに出たか）は載せない（`docs/display.md`「出力の分離（セリフと詳細）」）。モデルの文脈に戻るので短くする。
 */
export function reportRejectionText(violations: readonly ReportViolation[]): string {
  return [
    "レポートの記法の規約に次の違反がある。直して `report` を呼び直すこと:",
    ...violations.map((violation) => `- ${violationLine(violation)}`),
  ].join("\n")
}

/** 違反にしない上限（これを超えたら違反）。 */
const VIOLATION_THRESHOLDS = {
  "long-conclusion": 2,
  "long-paragraph": 0,
  "unknown-mermaid": 0,
  "too-many-notes": 2,
  "ragged-table": 0,
  "untitled-section": 0,
  "markdown-notation": 0,
} as const satisfies Record<ReportViolation["kind"], number>

function violationLine(violation: ReportViolation): string {
  switch (violation.kind) {
    case "long-conclusion":
      return `\`conclusion\` が${violation.count}文ある。2文以内にし、残りは \`sections\` へ移す`
    case "long-paragraph":
      return `4文以上の地の文が${violation.count}個ある。表・箇条書きへ移すか、\`fold\` で畳む`
    case "unknown-mermaid":
      return `mermaid の図に規約の10種の外の種類が${violation.count}個ある。10種から選ぶ（迷ったら flowchart）`
    case "too-many-notes":
      return `\`note\` の塊が${violation.count}個ある。1〜2個まで減らす`
    case "ragged-table":
      return `行のセルの数が \`columns\` と揃わない表が${violation.count}個ある。セルの数を揃える`
    case "untitled-section":
      return `見出しの無い節が${violation.count}個ある。節が2つ以上なら全部に \`heading\` を付ける`
    case "markdown-notation":
      return `\`markdown\` の塊に塊で書ける記法（${violation.notations
        .map((notation) => MARKDOWN_NOTATION_NAMES[notation].written)
        .join("・")}）がある。代わりに${violation.notations
        .map((notation) => MARKDOWN_NOTATION_NAMES[notation].replacement)
        .join("・")}を使う`
  }
}

/** 逃げ道の中の記法 → 差し戻しの文面での呼び名と、代わりに使うもの。 */
const MARKDOWN_NOTATION_NAMES = {
  heading: { written: "`#` / `##` の見出し", replacement: "節の `heading`" },
  table: { written: "表", replacement: "`table` の塊" },
  list: { written: "箇条書き", replacement: "`list` の塊" },
  note: { written: "`note` の塊", replacement: "`note` の塊（種別は `tone`）" },
  stats: { written: "`stats` の塊", replacement: "`stats` の塊" },
  progress: { written: "`progress` の塊", replacement: "`progress` の塊" },
  code: { written: "フェンス", replacement: "`code` の塊" },
  mermaid: { written: "mermaid のフェンス", replacement: "`mermaid` の塊" },
} as const satisfies Record<string, { readonly written: string; readonly replacement: string }>

export const MARKDOWN_NOTATIONS = Object.keys(MARKDOWN_NOTATION_NAMES).filter(
  (name): name is MarkdownNotation => name in MARKDOWN_NOTATION_NAMES,
)

const MERMAID_KINDS: ReadonlySet<string> = new Set(REPORT_MERMAID_KINDS)

/** `#` / `##` の見出し（CommonMark の ATX 見出し。行頭の空白は3つまで）。`###` は節の下の段で、塊の種類が無い。 */
const SECTION_HEADING = /^ {0,3}#{1,2}(?:[ \t]|$)/

/** 箇条書き・番号付きリスト・チェックリストの項目の頭。 */
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]/

/** フェンスの開き（CommonMark。行頭の空白は3つまで、`` ` `` か `~` を3つ以上）。 */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/

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
type SplitMarkdown = { readonly outside: readonly string[]; readonly fences: readonly Fence[] }

/**
 * 逃げ道の中身を、フェンスの外の行とフェンスの並びに分ける。`outside` は行の並びを保つため、
 * フェンスの行（開き・中身・閉じ）を空行に置き換えて残す。閉じの無いフェンスは末尾まで続く。
 */
function splitFences(markdown: string): SplitMarkdown {
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
    const opening = FENCE_OPEN.exec(line)
    if (opening === null) {
      return { ...state, outside: [...state.outside, line] }
    }
    return {
      ...state,
      outside: [...state.outside, ""],
      open: {
        marker: opening[1] ?? "```",
        info: (opening[2] ?? "").trim().split(/\s+/)[0] ?? "",
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

function fenceOf({ info, content, line }: Fence): Fence {
  return { info, content, line }
}

/** フェンスの閉じか（開きと同じ文字を、開き以上の数だけ並べた行）。 */
function closesFence(line: string, marker: string): boolean {
  const trimmed = line.trim()
  return (
    /^ {0,3}\S/.test(line) &&
    trimmed.length >= marker.length &&
    [...trimmed].every((char) => char === marker[0])
  )
}

/**
 * その記法が、逃げ道の HTML の容れ物〔`<details>` / `<div>`〕の中と外のどちらにあるか。
 * `inContainer` が `false` なら外側だけ（差し戻しの判定はここ）、`true` なら中だけを見る
 * （複数の塊を1つに畳む・`cols` に並べるのは逃げ道の役目なので、中は差し戻さない）。
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
  }
}

/** 塊の無い記法があるか。フェンスの中は見ない（`chart` だけはフェンスの info で判定する）。 */
function hasEscapeNotation({ outside, fences }: SplitMarkdown, notation: EscapeNotation): boolean {
  switch (notation) {
    case "colsCard":
      return outside.some((line) =>
        classLists(line).some((classes) => classes.includes("cols") || classes.includes("card")),
      )
    case "chart":
      return fences.some((fence) => fence.info === "chart")
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

/**
 * 地の文の段落。HTML の塊（`<details>` / `<div>`）の中は数えない（4文以上の段落の逃げ先が
 * `<details>` なので）。段落は空行か、地の文でない行で切れる。
 */
function paragraphs(lines: readonly string[]): readonly string[] {
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

/**
 * 文の数。句点（`。` `！` `？`）で数え、句点で終わらない末尾も1文と数える。inline code と
 * 全角の丸括弧の中は数えない（括弧の中の句点で文を割らない）。
 */
function sentenceCount(text: string): number {
  const plain = text
    .replace(/`[^`\n]*`/g, "")
    .replace(/（[^（）]*）/g, "")
    .trim()
  if (plain === "") {
    return 0
  }
  const terminated = countMatches(plain, /[。！？]+/g)
  return /[。！？]$/.test(plain) ? terminated : terminated + 1
}

/** 行のセルの数が列の数と揃わない表か。 */
function isRaggedTable(block: ReportBlock): boolean {
  return block.kind === "table" && block.rows.some((row) => row.length !== block.columns.length)
}

/**
 * mermaid の図の種類（ソースの最初の語）。空行・`%%` の行（コメントと init の指定）と、先頭の
 * `---` で囲んだ設定は飛ばす。中身が空なら空文字（10種に無いので違反になる）。
 */
function mermaidKind(source: string): string {
  const lines = source.split("\n").map((line) => line.trim())
  const afterFrontmatter =
    lines.find((line) => line !== "") === "---"
      ? lines.slice(lines.indexOf("---", lines.indexOf("---") + 1) + 1)
      : lines
  const first = afterFrontmatter.find((line) => line !== "" && !line.startsWith("%%"))
  return first?.split(/\s/)[0] ?? ""
}

/** 行に書かれた class の並びごとの名前（`class="note note-warn"` なら `["note", "note-warn"]`）。 */
function classLists(line: string): readonly (readonly string[])[] {
  return [...line.matchAll(/class=["']([^"']*)["']/g)].map((match) => (match[1] ?? "").split(/\s+/))
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length
}
