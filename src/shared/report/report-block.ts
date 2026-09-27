// `report` の本文の節と塊（docs/glossary.md「節」「塊」）の形と、節の並びから Markdown を組む決まり。
// 形の出どころはここだけ。
//
// 塊の文字は、描くときに Markdown か HTML の中へ埋める。
// Markdown に埋める文字は行頭の塊の記法と `<` を逃がして改行を畳み、許すのはインラインの記法（inline code・太字・リンク）だけにする。
// 逃げ道の `markdown` の塊だけは逃がさず、今の本文と同じ経路（許可リスト・mermaid・`chart`）で描く。

import { z } from "zod"

const inlineText = z.string()

// 畳むときの見出し。説明は `REPORT_SECTIONS_DESCRIPTION` に1回だけ書く
// （ここに `.describe` を足すと塊の数だけ繰り返されて JSON Schema が膨らむ）。
const fold = z.string().default("")

const textBlockSchema = z.object({
  kind: z.literal("text"),
  text: inlineText.describe(
    "地の文。3文まで（4文目が要るなら表・箇条書きへ移すか fold で畳む）。結論に効く数が2つ以上並ぶなら stats",
  ),
  fold,
})

const listBlockSchema = z.object({
  kind: z.literal("list"),
  style: z
    .enum(["bullet", "ordered", "check", "flow"])
    .describe(
      "bullet は発見・候補・ファイルの一覧（項目ごとに言うことが2つ以上なら表）/ ordered は順番に意味がある手順 / check は済み（done）と未了が混じる並び / " +
        "flow は一本道で3段以上辿る流れ（A → B → C と書かず項目を段にする。分岐・合流・戻りがあるなら mermaid の flowchart）",
    ),
  items: z
    .array(
      z.object({
        label: inlineText
          .default("")
          .describe("名前と説明の対の名前（「名前: 説明」と text に書かず、名前をここに分ける）"),
        text: inlineText,
        done: z.boolean().default(false),
      }),
    )
    .min(1),
  fold,
})

const REPORT_CELL_STATUSES = ["ok", "warn", "ng"] as const

const cellSchema = z.union([
  inlineText,
  z
    .object({ status: z.enum(REPORT_CELL_STATUSES), text: inlineText })
    .describe("状態のセル。色のバッジで描くので、状態を言う文字も text に書く"),
  z
    .object({ from: inlineText, to: inlineText })
    .describe("変わったセル（A → B と書かず前と後に分ける。状態は隣の列に置く）"),
])

const tableBlockSchema = z
  .object({
    kind: z.literal("table"),
    title: inlineText.describe("セルに無いことだけ: 何を並べた表か・並べた基準・数の出どころ"),
    columns: z.array(inlineText).min(2),
    rows: z.array(z.array(cellSchema)).min(1).describe("行ごとのセル。数は columns と揃える"),
    fold,
  })
  .describe("比較・対応・件数。同じ形の項目が2つ以上並んだら表")

const REPORT_NOTE_TONES = ["info", "warn", "ng", "ask", "memo"] as const

const noteBlockSchema = z.object({
  kind: z.literal("note"),
  tone: z
    .enum(REPORT_NOTE_TONES)
    .describe("info は結論 / warn は注意 / ng は異常 / ask は確かめていないこと / memo は覚え書き"),
  text: inlineText.describe(
    "読み飛ばされると困る一文。種別を言う語（「注意:」など）は書かない。1つのレポートに1〜2個まで",
  ),
  fold,
})

const statsBlockSchema = z
  .object({
    kind: z.literal("stats"),
    items: z
      .array(
        z.object({
          before: z.string().default("").describe("変わる前の数（前後を見せるときだけ）"),
          value: z.string(),
          label: inlineText,
        }),
      )
      .min(2)
      .max(4),
    fold,
  })
  .describe("結論に効く数（件数・前後の差）。数が2〜4個並び、その数自体が結論のとき")

const codeBlockSchema = z
  .object({
    kind: z.literal("code"),
    language: z.string().describe("言語名。変更の前後は diff"),
    path: z.string().default("").describe("どのファイルか（要るときだけ。1つの塊に1ファイル）"),
    source: z.string(),
    fold,
  })
  .describe("コード・コマンド・エラー文")

/**
 * mermaid の種類のうち、tsukumo が配る mermaid で描けると確かめたもの（`package.json` で版を固定しているのはこの実測のため）。
 * 挙げていない種類には構文が通らないものが混ざる。
 */
export const REPORT_MERMAID_KINDS = [
  "flowchart",
  "sequenceDiagram",
  "stateDiagram-v2",
  "classDiagram",
  "erDiagram",
  "mindmap",
  "timeline",
  "gantt",
  "gitGraph",
  "quadrantChart",
] as const

const mermaidBlockSchema = z
  .object({
    kind: z.literal("mermaid"),
    source: z
      .string()
      .describe(
        `図のソース。種類は ${REPORT_MERMAID_KINDS.join(" / ")} の${String(REPORT_MERMAID_KINDS.length)}種だけ（迷ったら flowchart）。` +
          "ラベルの引用符・バッククォートは #quot; / #96; と書く",
      ),
    fold,
  })
  .describe(
    "名前が3つ以上出てきて、その間を渡す・呼ぶ・分かれるでつなぐとき（一本道なら list の flow）",
  )

const progressBlockSchema = z
  .object({
    kind: z.literal("progress"),
    steps: z
      .array(inlineText)
      .min(1)
      .describe("段の名前の並び。空文字の段は tsukumo が1始まりの番号を振る"),
    current: z
      .number()
      .int()
      .min(0)
      .describe("いまの段の位置（0始まり）。全部済んだら steps.length"),
    fold,
  })
  .describe(
    "「N のうち M 段目」のように段（フェーズ）の名前と位置が分かっているとき。文字で「N のうち M」と書かない",
  )

const markdownBlockSchema = z.object({
  kind: z.literal("markdown"),
  markdown: z
    .string()
    .describe("どの塊にも当てはまらない記法（cols・chart・svg・引用・区切り線）だけ"),
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
  progressBlockSchema,
  markdownBlockSchema,
])

export type ReportBlock = DeepReadonly<z.infer<typeof reportBlockSchema>>

export const reportSectionSchema = z.object({
  heading: z
    .string()
    .default("")
    .describe(
      "その節の結論を言う語（「変更点」「まとめ」のようなどのレポートにも当てはまる語にしない）。節が1つなら省いてよく、2つ以上なら全部に付ける",
    ),
  blocks: z.array(reportBlockSchema).min(1),
})

export type ReportSection = DeepReadonly<z.infer<typeof reportSectionSchema>>

/**
 * 配列を読み取り専用の型に畳む。`z.array(...).readonly()` は JSON Schema に `readOnly: true` を
 * 出す（`tool` に渡す `report` の引数がこれで膨らむ）ので、型だけをここで付け直す。
 */
type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

/**
 * 文字列の本文（`sections` に切り替える前の `report` の `body`）を節に畳む。空白だけなら節は無く、それ以外は見出しの無い節1つに
 * 逃げ道の塊1つ。頭の空行と末尾の空白は落とす（描いた見た目は変わらず、送り直しの判定で空白の差を見ないため）。
 */
export function reportSectionsOfBody(body: string): readonly ReportSection[] {
  const markdown = body.replace(/^(?:[ \t]*\n)+/, "").trimEnd()
  return markdown === ""
    ? []
    : [{ heading: "", blocks: [{ kind: "markdown", markdown, fold: "" }] }]
}

/**
 * `reportBlockSchema` が知っている塊の種類。`reportBlockSchema` の枝から導き、塊を1種類足して
 * ここへ書き忘れる経路を型で塞ぐ（列挙し直すと `satisfies` は部分集合しか検査しない）。
 */
export const REPORT_BLOCK_KINDS: readonly ReportBlock["kind"][] = reportBlockSchema.options.map(
  (option) => option.shape.kind.value,
)

export type ParsedReportSections = {
  readonly sections: readonly ReportSection[]
  /** 知らない種類（{@link REPORT_BLOCK_KINDS} に無い `kind`）で落とした塊の数。 */
  readonly unknownBlockCount: number
}

/**
 * `report` の引数の `sections` を取り出す。塊ごとに検証し、崩れた塊と知らない種類の塊は落とす
 * （塊1つの読み損ねでレポートを捨てない）。塊が残らない節と、配列でない値は無いものとする。
 */
export function parseReportSections(value: unknown): ParsedReportSections {
  const sections = z.array(z.unknown()).safeParse(value)
  if (!sections.success) {
    return { sections: [], unknownBlockCount: 0 }
  }
  const parsed = sections.data.flatMap((candidate) => {
    const section = looseSectionSchema.safeParse(candidate)
    return section.success ? [section.data] : []
  })
  return {
    sections: parsed.flatMap(({ heading, blocks }) => {
      const valid = blocks.flatMap((block) => {
        const parsedBlock = reportBlockSchema.safeParse(block)
        return parsedBlock.success ? [parsedBlock.data] : []
      })
      return valid.length === 0 ? [] : [{ heading, blocks: valid }]
    }),
    unknownBlockCount: parsed.flatMap(({ blocks }) => blocks).filter(isUnknownKindBlock).length,
  }
}

/** 節と節の境目に置く、見た目を持たない印。書き上げる演出（`planReveal`）がこれで節を1トピックに割る。 */
const SECTION_BREAK_MARKDOWN = '<div class="report-section-break"></div>'

/** 節の並びを1つの Markdown に組む。空の塊・空の節は置かず、節の間に {@link SECTION_BREAK_MARKDOWN} を挟む。 */
export function reportSectionsMarkdown(sections: readonly ReportSection[]): string {
  const parts = sections
    .map((section) =>
      joinParts([
        section.heading.trim() === "" ? "" : `## ${markdownInline(section.heading)}`,
        ...section.blocks.map((block) => foldedBlockMarkdown(block)),
      ]),
    )
    .filter((part) => part.trim() !== "")
  return parts.join(`\n\n${SECTION_BREAK_MARKDOWN}\n\n`)
}

/**
 * HTML の中に埋める1行の文字。改行を空白に畳み、HTML として逃がす（Markdown の記法は効かない）。
 */
export function htmlInline(text: string): string {
  return escapeHtml(text.replace(/\s+/g, " ").trim())
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

/** 塊を1つずつ検証するために、節の見出しだけを先に読む形。 */
const looseSectionSchema = z.object({
  heading: reportSectionSchema.shape.heading,
  blocks: z.array(z.unknown()),
})

const blockKindSchema = z.object({ kind: z.string() })

function isUnknownKindBlock(block: unknown): boolean {
  const kind = blockKindSchema.safeParse(block)
  return kind.success && !REPORT_BLOCK_KINDS.some((known) => known === kind.data.kind)
}

/** 表のセルの状態 → バッジの class（記法の `badge-*`）と、書き手の文字に関わらず付ける語。 */
const CELL_BADGES = {
  ok: { className: "badge-ok", label: "OK" },
  warn: { className: "badge-warn", label: "要注意" },
  ng: { className: "badge-ng", label: "NG" },
} as const satisfies Record<
  (typeof REPORT_CELL_STATUSES)[number],
  { readonly className: string; readonly label: string }
>

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
      return listMarkdown(block)
    case "table":
      return tableMarkdown(block)
    case "note":
      return block.text.trim() === ""
        ? ""
        : `<div class="${NOTE_CLASSES[block.tone]}">\n\n${markdownInline(block.text)}\n\n</div>`
    case "stats":
      return `<div class="stats">${block.items
        .map(
          ({ before, value, label }) =>
            `<div class="stat">${before.trim() === "" ? "" : `<span class="stat-before">${htmlInlineWithCode(before)} →</span>`}<b>${htmlInlineWithCode(value)}</b>${htmlInlineWithCode(label)}</div>`,
        )
        .join("")}</div>`
    case "code":
      return fencedMarkdown([block.language, block.path].join(" ").trim(), block.source)
    case "mermaid":
      return fencedMarkdown("mermaid", block.source)
    case "progress":
      return progressMarkdown(block)
    case "markdown":
      return block.markdown
  }
}

/**
 * 済んだ段は `済`、いまの段は `今`、残りの段は番号を前置きし、class だけでなく文字でも見分けられるようにする。
 * 名前が空文字の段は1始まりの番号を名前にする（残りの段は前置きがすでに番号なので名前を出さない）。
 */
function progressMarkdown(block: Extract<ReportBlock, { readonly kind: "progress" }>): string {
  const steps = block.steps.map((step, index) => {
    const ordinal = index + 1
    const state = index < block.current ? "done" : index === block.current ? "current" : "upcoming"
    const mark = state === "done" ? "済" : state === "current" ? "今" : String(ordinal)
    const stepClass =
      state === "upcoming" ? "progress-step" : `progress-step progress-step-${state}`
    const label = step.trim() !== "" ? step : state === "upcoming" ? "" : String(ordinal)
    return `<div class="${stepClass}"><b>${htmlInlineWithCode(mark)}</b>${htmlInlineWithCode(label)}</div>`
  })
  return `<div class="progress">${steps.join("")}</div>`
}

type ListBlock = Extract<ReportBlock, { readonly kind: "list" }>

/**
 * 名前（`label`）が1つでもある並びは、Markdown の並びのまま名前と説明を `span` に分けて容れ物で包む
 * （名前と説明の2列に揃えるのは CSS。`style` の印と説明の inline の記法はそのまま効く）。
 */
function listMarkdown(block: ListBlock): string {
  const style = block.style
  if (style === "flow") {
    return flowMarkdown(block)
  }
  const labeled = block.items.some((item) => item.label.trim() !== "")
  const lines = block.items.map((item, index) => {
    const marker = listMarker(style, index, item.done)
    return labeled
      ? `${marker} <span class="list-label">${markdownInline(item.label)}</span><span class="list-text">${markdownInline(item.text)}</span>`
      : `${marker} ${markdownInline(item.text)}`
  })
  return labeled ? `<div class="labeled-list">\n\n${lines.join("\n")}\n\n</div>` : lines.join("\n")
}

/** 項目を札にし、札の間に矢印の文字を置く。名前があれば札の頭に太字で添える。 */
function flowMarkdown(block: ListBlock): string {
  const steps = block.items.map(({ label, text }) => {
    const name = label.trim() === "" ? "" : `<b>${htmlInlineWithCode(label)}</b>`
    return `<span class="flow-step">${name}${htmlInlineWithCode(text)}</span>`
  })
  return `<div class="flow">${steps.join('<span class="flow-arrow">→</span>')}</div>`
}

function listMarker(
  style: Exclude<ListBlock["style"], "flow">,
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
  const aligns = table.columns.map((_, index) => columnAlign(table.rows, index))
  return joinParts([
    table.title.trim() === "" ? "" : `**${markdownInline(table.title)}**`,
    [
      row(table.columns.map((column) => cellMarkdown(column))),
      row(aligns.map(alignMarker)),
      ...table.rows.map((cells) => row(cells.map((cell) => cellMarkdown(cell)))),
    ].join("\n"),
  ])
}

type ColumnAlign = "left" | "right" | "center"

/** 見た目だけの数字（符号・桁区切り・小数点・末尾の % を許す）。単位付きの数字は左揃えのまま。 */
const NUMERIC_CELL_PATTERN = /^-?\d[\d,]*(?:\.\d+)?%?$/

type ReportCell = z.infer<typeof cellSchema>

/** 列の全セルが状態なら中央、全セルが数（前と後がどちらも数の変化を含む）なら右に揃える。 */
function columnAlign(
  rows: Extract<ReportBlock, { readonly kind: "table" }>["rows"],
  index: number,
): ColumnAlign {
  const cells = rows.map((row) => row[index])
  if (cells.every((cell) => typeof cell === "object" && "status" in cell)) {
    return "center"
  }
  if (cells.every((cell) => cell !== undefined && isNumericCell(cell))) {
    return "right"
  }
  return "left"
}

function isNumericCell(cell: ReportCell): boolean {
  if (typeof cell === "string") {
    return NUMERIC_CELL_PATTERN.test(cell)
  }
  return (
    "from" in cell && NUMERIC_CELL_PATTERN.test(cell.from) && NUMERIC_CELL_PATTERN.test(cell.to)
  )
}

/** GFM の列揃えの記法（`:---:` / `---:`）。 */
function alignMarker(align: ColumnAlign): string {
  switch (align) {
    case "left":
      return "---"
    case "right":
      return "---:"
    case "center":
      return ":---:"
  }
}

function cellMarkdown(cell: ReportCell): string {
  if (typeof cell === "string") {
    return markdownInline(cell).replaceAll("|", "\\|")
  }
  if ("from" in cell) {
    return `<span class="change-from">${markdownInline(cell.from)} →</span> ${markdownInline(cell.to)}`.replaceAll(
      "|",
      "\\|",
    )
  }
  const badge = CELL_BADGES[cell.status]
  const mark = `<span class="badge ${badge.className}">${badge.label}</span>`
  const text = cell.text.trim()
  return text === "" || text === badge.label
    ? mark
    : `${mark} ${markdownInline(text).replaceAll("|", "\\|")}`
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
  return escapeLineStart(
    mapCodeSpans(
      flat,
      (part) => part.replaceAll("<", "&lt;"),
      (span) => span,
    ),
  )
}

/**
 * HTML の中に埋める1行の文字。`htmlInline` と同じく逃がし、inline code だけは `code` 要素にする
 * （HTML の中では Markdown の inline code が効かないため）。
 */
function htmlInlineWithCode(text: string): string {
  return mapCodeSpans(
    text.replace(/\s+/g, " ").trim(),
    (part) => escapeHtml(part),
    (span) => `<code>${escapeHtml(codeSpanContent(span))}</code>`,
  )
}

/** inline code の中身。CommonMark に合わせ、両端に空白があれば1つずつ落とす。 */
function codeSpanContent(span: string): string {
  const fence = /^`+/.exec(span)?.[0].length ?? 0
  const inner = span.slice(fence, span.length - fence)
  return /^ .*[^ ].* $/.test(inner) ? inner.slice(1, -1) : inner
}

function escapeLineStart(text: string): string {
  if (/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(text)) {
    return `\\${text}`
  }
  if (ORDERED_LIST_START.test(text)) {
    return text.replace(ORDERED_LIST_START, "$1\\$2")
  }
  // info 文字列にバッククォートがある行はフェンスにならない（CommonMark）。```x``` は inline code
  return /^(?:#|>|\||[-+*](?=\s|$)|`{3,}[^`]*$|~{3,})/.test(text) ? `\\${text}` : text
}

function mapCodeSpans(
  text: string,
  outside: (part: string) => string,
  span: (codeSpan: string) => string,
): string {
  const { parts, last } = [...text.matchAll(CODE_SPAN)].reduce<{
    readonly parts: readonly string[]
    readonly last: number
  }>(
    (acc, match) => ({
      parts: [...acc.parts, outside(text.slice(acc.last, match.index)), span(match[0])],
      last: match.index + match[0].length,
    }),
    { parts: [], last: 0 },
  )
  return [...parts, outside(text.slice(last))].join("")
}
