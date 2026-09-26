// `report` の本文の節と塊（docs/glossary.md「節」「塊」）の形と、節の並びから Markdown を組む決まり。
// 形の出どころはここだけ。
//
// 塊の文字は、描くときに Markdown か HTML の中へ埋める。
// Markdown に埋める文字は行頭の塊の記法と `<` を逃がして改行を畳み、許すのはインラインの記法（inline code・太字・リンク）だけにする。
// 逃げ道の `markdown` の塊だけは逃がさず、今の本文と同じ経路（許可リスト・mermaid・`chart`）で描く。

import { z } from "zod"

const inlineText = z.string()

const fold = z.string().default("").describe("畳むときの見出し。畳んでも結論が通る塊だけ")

const textBlockSchema = z.object({
  kind: z.literal("text"),
  text: inlineText.describe("地の文。3文まで"),
  fold,
})

const listBlockSchema = z.object({
  kind: z.literal("list"),
  style: z.enum(["bullet", "ordered", "check"]),
  items: z
    .array(z.object({ text: inlineText, done: z.boolean().default(false) }))
    .min(1)
    .readonly(),
  fold,
})

const REPORT_CELL_STATUSES = ["ok", "warn", "ng"] as const

const cellSchema = z.union([
  inlineText,
  z.object({ status: z.enum(REPORT_CELL_STATUSES), text: inlineText }),
])

const tableBlockSchema = z.object({
  kind: z.literal("table"),
  title: inlineText.describe("何を並べた表か・並べた基準・数の出どころ"),
  columns: z.array(inlineText).min(2).readonly(),
  rows: z.array(z.array(cellSchema).readonly()).min(1).readonly(),
  fold,
})

const REPORT_NOTE_TONES = ["info", "warn", "ng", "ask", "memo"] as const

const noteBlockSchema = z.object({
  kind: z.literal("note"),
  tone: z.enum(REPORT_NOTE_TONES),
  text: inlineText.describe("読み飛ばされると困る一文。1つのレポートに1〜2個まで"),
  fold,
})

const statsBlockSchema = z.object({
  kind: z.literal("stats"),
  items: z
    .array(z.object({ value: z.string(), label: inlineText }))
    .min(2)
    .max(4)
    .readonly(),
  fold,
})

const codeBlockSchema = z.object({
  kind: z.literal("code"),
  language: z.string().describe("変更の前後は diff"),
  path: z.string().default("").describe("どのファイルか"),
  source: z.string(),
  fold,
})

const mermaidBlockSchema = z.object({
  kind: z.literal("mermaid"),
  source: z.string().describe("名前が3つ以上出てきて間を渡す・呼ぶ・分かれるでつなぐとき"),
  fold,
})

const markdownBlockSchema = z.object({
  kind: z.literal("markdown"),
  markdown: z.string().describe("上のどの塊にも当てはまらないときだけ"),
  fold,
})

export const reportBlockSchema = z.discriminatedUnion("kind", [
  textBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  noteBlockSchema,
  statsBlockSchema,
  codeBlockSchema,
  mermaidBlockSchema,
  markdownBlockSchema,
])

export type ReportBlock = z.infer<typeof reportBlockSchema>

export const reportSectionSchema = z.object({
  heading: z.string().default("").describe("その節の結論を言う語。節が1つなら省いてよい"),
  blocks: z.array(reportBlockSchema).min(1).readonly(),
})

export type ReportSection = z.infer<typeof reportSectionSchema>

/**
 * 文字列の本文（`report` の `body`）を節に畳む。空白だけなら節は無く、それ以外は見出しの無い節1つに
 * 逃げ道の塊1つ。頭の空行と末尾の空白は落とす（描いた見た目は変わらず、送り直しの判定で空白の差を見ないため）。
 */
export function reportSectionsOfBody(body: string): readonly ReportSection[] {
  const markdown = body.replace(/^(?:[ \t]*\n)+/, "").trimEnd()
  return markdown === ""
    ? []
    : [{ heading: "", blocks: [{ kind: "markdown", markdown, fold: "" }] }]
}

/** 節の並びを1つの Markdown に組む。空の塊・空の節は置かない。 */
export function reportSectionsMarkdown(sections: readonly ReportSection[]): string {
  return joinParts(
    sections.map((section) =>
      joinParts([
        section.heading.trim() === "" ? "" : `## ${markdownInline(section.heading)}`,
        ...section.blocks.map((block) => foldedBlockMarkdown(block)),
      ]),
    ),
  )
}

/**
 * HTML の中に埋める1行の文字。改行を空白に畳み、HTML として逃がす（Markdown の記法は効かない）。
 */
export function htmlInline(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

/** 表のセルの状態 → バッジの class（記法の `badge-*`）。 */
const CELL_BADGES = {
  ok: "badge-ok",
  warn: "badge-warn",
  ng: "badge-ng",
} as const satisfies Record<(typeof REPORT_CELL_STATUSES)[number], string>

/** `note` の種別 → 記法の class。ラベルは描く側が class から引く（`REPORT_NOTE_KINDS`）。 */
const NOTE_CLASSES = {
  info: "note",
  warn: "note note-warn",
  ng: "note note-ng",
  ask: "note note-ask",
  memo: "note note-memo",
} as const satisfies Record<(typeof REPORT_NOTE_TONES)[number], string>

/** inline code（開きと同じ数のバッククォートで閉じる）。中の文字は逃がさない。 */
const CODE_SPAN = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g

/** 番号付きリストの頭（`1.` / `1)`）。1つ目が番号、2つ目が区切りの記号。 */
const ORDERED_LIST_START = /^(\d{1,9})([.)])(?=\s|$)/

function joinParts(parts: readonly string[]): string {
  return parts.filter((part) => part.trim() !== "").join("\n\n")
}

function foldedBlockMarkdown(block: ReportBlock): string {
  const markdown = blockMarkdown(block)
  return block.fold.trim() === "" || markdown.trim() === ""
    ? markdown
    : `<details><summary>${htmlInline(block.fold)}</summary>\n\n${markdown}\n\n</details>`
}

function blockMarkdown(block: ReportBlock): string {
  switch (block.kind) {
    case "text":
      return markdownInline(block.text)
    case "list":
      return block.items
        .map(
          (item, index) =>
            `${listMarker(block.style, index, item.done)} ${markdownInline(item.text)}`,
        )
        .join("\n")
    case "table":
      return tableMarkdown(block)
    case "note":
      return block.text.trim() === ""
        ? ""
        : `<div class="${NOTE_CLASSES[block.tone]}">\n\n${markdownInline(block.text)}\n\n</div>`
    case "stats":
      return `<div class="stats">${block.items
        .map(
          ({ value, label }) =>
            `<div class="stat"><b>${htmlInline(value)}</b>${htmlInline(label)}</div>`,
        )
        .join("")}</div>`
    case "code":
      return fencedMarkdown([block.language, block.path].join(" ").trim(), block.source)
    case "mermaid":
      return fencedMarkdown("mermaid", block.source)
    case "markdown":
      return block.markdown
  }
}

function listMarker(
  style: Extract<ReportBlock, { readonly kind: "list" }>["style"],
  index: number,
  done: boolean,
): string {
  switch (style) {
    case "bullet":
      return "-"
    case "ordered":
      return `${index + 1}.`
    case "check":
      return done ? "- [x]" : "- [ ]"
  }
}

function tableMarkdown(table: Extract<ReportBlock, { readonly kind: "table" }>): string {
  const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`
  return joinParts([
    table.title.trim() === "" ? "" : `**${markdownInline(table.title)}**`,
    [
      row(table.columns.map((column) => cellMarkdown(column))),
      row(table.columns.map(() => "---")),
      ...table.rows.map((cells) => row(cells.map((cell) => cellMarkdown(cell)))),
    ].join("\n"),
  ])
}

function cellMarkdown(cell: z.infer<typeof cellSchema>): string {
  if (typeof cell === "string") {
    return markdownInline(cell).replaceAll("|", "\\|")
  }
  return `<span class="badge ${CELL_BADGES[cell.status]}">${markdownInline(cell.text).replaceAll("|", "\\|")}</span>`
}

/**
 * フェンスで囲む。フェンスは中身に出てくるバッククォートの並びより長くする（中身で閉じないように）。
 */
function fencedMarkdown(info: string, source: string): string {
  const longest = Math.max(0, ...[...source.matchAll(/`+/g)].map(([run]) => run.length))
  const fence = "`".repeat(Math.max(3, longest + 1))
  return `${fence}${info}\n${source.replace(/\n$/, "")}\n${fence}`
}

/**
 * Markdown の中に埋める1行の文字。改行を空白に畳み、inline code の外の `<` を逃がし、
 * 行頭で塊の記法（見出し・引用・箇条書き・番号付きリスト・表・フェンス・区切り線）になる文字を逃がす。
 */
function markdownInline(text: string): string {
  const flat = text.replace(/\s*\n\s*/g, " ").trim()
  return escapeLineStart(outsideCodeSpans(flat, (part) => part.replaceAll("<", "&lt;")))
}

function escapeLineStart(text: string): string {
  if (/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(text)) {
    return `\\${text}`
  }
  if (ORDERED_LIST_START.test(text)) {
    return text.replace(ORDERED_LIST_START, "$1\\$2")
  }
  return /^(?:#|>|\||[-+*](?=\s|$)|`{3,}|~{3,})/.test(text) ? `\\${text}` : text
}

function outsideCodeSpans(text: string, escape: (part: string) => string): string {
  const { parts, last } = [...text.matchAll(CODE_SPAN)].reduce<{
    readonly parts: readonly string[]
    readonly last: number
  }>(
    (acc, match) => ({
      parts: [...acc.parts, escape(text.slice(acc.last, match.index)), match[0]],
      last: match.index + match[0].length,
    }),
    { parts: [], last: 0 },
  )
  return [...parts, escape(text.slice(last))].join("")
}
