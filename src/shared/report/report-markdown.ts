// 節の並びから Markdown を組む決まり。塊の文字の逃がし方もここが持つ。
//
// 塊の文字は、描くときに Markdown か HTML の中へ埋める。
// Markdown に埋める文字は行頭の塊の記法と `<` を逃がして改行を畳み、許すのはインラインの記法（inline code・太字・リンク）だけにする。
// 逃げ道の `markdown` の塊だけは逃がさず、今の本文と同じ経路（許可リスト・mermaid・`chart`）で描く。

import {
  REPORT_CELL_STATUSES,
  REPORT_MATRIX_STATUSES,
  type ReportBlock,
  type ReportSection,
} from "./report-block.ts"
import { reportImagePath } from "./report-image.ts"

/** 節と節の境目に置く、見た目を持たない印。書き上げる演出（`planReveal`）がこれで節を1トピックに割る。 */
const SECTION_BREAK_MARKDOWN = '<div class="report-section-break"></div>'

/** 結論と検証結果のあと、最初の節の前に置く印。書き上げる演出は、この印より後ろだけを筆の対象にする。 */
export const SECTIONS_START_MARKDOWN = '<div class="report-sections-start"></div>'

/**
 * `image` の塊の画像をどこから読むか。
 * `shelved` は描いた `report` の呼び出しの id で棚を引く。`none` は棚に置いていない本文で、画像は「出せない」の札になる。
 */
export type ReportImageSource =
  | { readonly kind: "shelved"; readonly toolUseId: string }
  | { readonly kind: "none" }

type SectionsFold = {
  readonly parts: readonly string[]
  readonly imageCount: number
}

/**
 * 節の並びを1つの Markdown に組む。空の塊・空の節は置かず、節の間に {@link SECTION_BREAK_MARKDOWN} を挟む。
 * `image` の塊は、節をまたいで並びの順に数えた「図 n」の番号を1回だけ受け取る（{@link foldedBlockMarkdown}）。
 */
export function reportSectionsMarkdown(
  sections: readonly ReportSection[],
  imageSource: ReportImageSource,
): string {
  const { parts } = sections.reduce<SectionsFold>(
    (acc, section) => {
      const blocks = section.blocks.reduce<{
        readonly markdowns: readonly string[]
        readonly imageCount: number
      }>(
        (blockAcc, block) => {
          const imageOrdinal =
            block.kind === "image" ? blockAcc.imageCount + 1 : blockAcc.imageCount
          return {
            markdowns: [
              ...blockAcc.markdowns,
              foldedBlockMarkdown(block, imageSource, imageOrdinal),
            ],
            imageCount: imageOrdinal,
          }
        },
        { markdowns: [], imageCount: acc.imageCount },
      )
      const part = joinParts([
        section.heading.trim() === "" ? "" : `## ${markdownInline(section.heading)}`,
        ...blocks.markdowns,
      ])
      return {
        parts: part.trim() === "" ? acc.parts : [...acc.parts, part],
        imageCount: blocks.imageCount,
      }
    },
    { parts: [], imageCount: 0 },
  )
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

/** 二重引用符で囲む HTML 属性の値に埋める1行の文字。`htmlInline` に加えて `"` も逃がす。 */
function htmlAttribute(text: string): string {
  return htmlInline(text).replaceAll('"', "&quot;")
}

/**
 * 書き上げる演出（`planReveal`）が筆を留める対象の印。
 * `NotationBlock` は記法の語彙にある class 名だけを CSS Modules のハッシュ名へ置き換えるので、
 * 語彙に無いこの名前は素通りする。
 */
const PAUSE_POINT_CLASS_NAME = "report-pause-point"

/** 表のセルの状態 → 記号付きの印の class（記法の `cell-status-*`）・記号・書き手の文字に関わらず付ける語。 */
const CELL_STATUS_MARKS = {
  ok: { className: "cell-status-ok", symbol: "✓", label: "OK" },
  warn: { className: "cell-status-warn", symbol: "！", label: "要注意" },
  ng: { className: "cell-status-ng", symbol: "✕", label: "NG" },
} as const satisfies Record<
  Extract<ReportCell, { readonly status: string }>["status"],
  { readonly className: string; readonly symbol: string; readonly label: string }
>

/** 対応表の状態 → 印の class・記号・読み上げと凡例の語。 */
const MATRIX_MARKS = {
  ok: { className: "matrix-mark-ok", symbol: "✓", label: "OK" },
  warn: { className: "matrix-mark-warn", symbol: "！", label: "要注意" },
  ng: { className: "matrix-mark-ng", symbol: "✕", label: "NG" },
  na: { className: "matrix-mark-na", symbol: "－", label: "該当なし" },
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "matrix" }>["rows"][number]["cells"][number],
  { readonly className: string; readonly symbol: string; readonly label: string }
>

/** 候補の判定 → カードとバッジの class と、バッジに出す語。「採る」は筆を留める対象。 */
const OPTION_VERDICTS = {
  adopt: {
    cardClass: `option option-adopt ${PAUSE_POINT_CLASS_NAME}`,
    badgeClass: "badge badge-ok",
    label: "採る",
  },
  consider: { cardClass: "option", badgeClass: "badge", label: "検討" },
  reject: { cardClass: "option option-reject", badgeClass: "badge", label: "採らない" },
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "options" }>["items"][number]["verdict"],
  { readonly cardClass: string; readonly badgeClass: string; readonly label: string }
>

/** ファイルの変更の種別 → 行の頭に出す語。 */
const FILE_CHANGE_LABELS = {
  added: "追加",
  modified: "変更",
  deleted: "削除",
  read: "読んだ",
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "files" }>["items"][number]["change"],
  string
>

/** `note` の種別 → 記法の class。ラベルは描く側が class から引く（`REPORT_NOTE_KINDS`）。注意・異常は筆を留める対象。 */
const NOTE_CLASSES = {
  info: "note",
  warn: `note note-warn ${PAUSE_POINT_CLASS_NAME}`,
  ng: `note note-ng ${PAUSE_POINT_CLASS_NAME}`,
  ask: "note note-ask",
  memo: "note note-memo",
} as const satisfies Record<Extract<ReportBlock, { readonly kind: "note" }>["tone"], string>

/** inline code（開きと同じ数のバッククォートで閉じる）。中の文字は逃がさない。 */
const CODE_SPAN = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g

/** 番号付きリストの頭（`1.` / `1)`）。1つ目が番号、2つ目が区切りの記号。 */
const ORDERED_LIST_START = /^(\d{1,9})([.)])(?=\s|$)/

function joinParts(parts: readonly string[]): string {
  return parts.filter((part) => part.trim() !== "").join("\n\n")
}

function foldedBlockMarkdown(
  block: ReportBlock,
  imageSource: ReportImageSource,
  imageOrdinal: number,
): string {
  const markdown = blockMarkdown(block, imageSource, imageOrdinal)
  return block.fold.trim() === "" || markdown.trim() === ""
    ? markdown
    : `<details><summary>${htmlInline(block.fold)}</summary>\n\n${markdown}\n\n</details>`
}

function blockMarkdown(
  block: ReportBlock,
  imageSource: ReportImageSource,
  imageOrdinal: number,
): string {
  switch (block.kind) {
    case "text":
      return markdownInline(block.text)
    case "list":
      return listMarkdown(block)
    case "table":
      return tableMarkdown(block)
    case "matrix":
      return matrixMarkdown(block)
    case "compare":
      return compareMarkdown(block)
    case "dimension":
      return dimensionMarkdown(block)
    case "note":
      return block.text.trim() === ""
        ? ""
        : `<div class="${NOTE_CLASSES[block.tone]}">\n\n${markdownInline(block.text)}\n\n</div>`
    case "stats":
      return `<div class="stats">${block.items.map(statMarkdown).join("")}</div>`
    case "code":
      return fencedMarkdown([block.language, block.path].join(" ").trim(), block.source)
    case "mermaid":
      return fencedMarkdown("mermaid", block.source)
    case "chart":
      return fencedMarkdown("chart", JSON.stringify(chartConfigOf(block)))
    case "progress":
      return progressMarkdown(block)
    case "options":
      return optionsMarkdown(block)
    case "image":
      return imageMarkdown(block, imageSource, imageOrdinal)
    case "files":
      return filesMarkdown(block)
    case "markdown":
      return block.markdown
  }
}

type ChartConfig = {
  readonly type: string
  readonly data: {
    readonly labels: readonly string[]
    readonly datasets: readonly { readonly label: string; readonly data: readonly number[] }[]
  }
  readonly options: { readonly indexAxis: "y" } | Record<string, never>
}

/** `chart` の塊から Chart.js の設定を組む。色は書かない。`pie` は `series` の先頭だけを描く。 */
function chartConfigOf(block: Extract<ReportBlock, { readonly kind: "chart" }>): ChartConfig {
  const series = block.chartKind === "pie" ? block.series.slice(0, 1) : block.series
  return {
    type: block.chartKind,
    data: {
      labels: [...block.labels],
      datasets: series.map(({ name, values }) => ({ label: name, data: [...values] })),
    },
    options: block.chartKind === "bar" && block.horizontal ? { indexAxis: "y" } : {},
  }
}

type ProgressStepState = "done" | "current" | "upcoming"

const PROGRESS_STATE_LABELS = {
  done: "済",
  current: "進行中",
  upcoming: "まだ",
} satisfies Record<ProgressStepState, string>

/**
 * 節（丸）と線でつないだ1本の道。段の名前が空文字なら1始まりの番号を名前にする。
 * 見分けは丸の中身（✓／輪と点／空の輪）と `aria-current`・`aria-label` が持ち、名前の字の色は補助。
 */
function progressMarkdown(block: Extract<ReportBlock, { readonly kind: "progress" }>): string {
  const items = block.steps.flatMap((step, index) => {
    const ordinal = index + 1
    const state: ProgressStepState =
      index < block.current ? "done" : index === block.current ? "current" : "upcoming"
    const label = step.trim() !== "" ? step : String(ordinal)
    const stepHtml = progressStepMarkdown(state, label)
    return index === 0 ? [stepHtml] : [progressLineMarkdown(index - 1 < block.current), stepHtml]
  })
  return `<ol class="progress" aria-label="進み具合">${items.join("")}</ol>`
}

function progressLineMarkdown(done: boolean): string {
  const lineClass = done ? "progress-line progress-line-done" : "progress-line"
  return `<li class="${lineClass}" aria-hidden="true"></li>`
}

function progressStepMarkdown(state: ProgressStepState, label: string): string {
  const stepClass = state === "upcoming" ? "progress-step" : `progress-step progress-step-${state}`
  const current = state === "current" ? ' aria-current="step"' : ""
  const dot =
    state === "done"
      ? '<span class="progress-dot" aria-hidden="true">✓</span>'
      : state === "current"
        ? '<span class="progress-dot" aria-hidden="true"><span class="progress-dot-mark"></span></span>'
        : '<span class="progress-dot" aria-hidden="true"></span>'
  const status =
    state === "current"
      ? `<span class="progress-status">${PROGRESS_STATE_LABELS[state]}</span>`
      : ""
  return (
    `<li class="${stepClass}"${current} aria-label="${htmlAttribute(label)}：${PROGRESS_STATE_LABELS[state]}">` +
    `${dot}<span class="progress-name">${htmlInlineWithCode(label)}</span>${status}</li>`
  )
}

/** 候補を書き手の順のままカードにし、頭に判定のバッジを置く（並べ替えは再構成になるのでしない）。 */
function optionsMarkdown(block: Extract<ReportBlock, { readonly kind: "options" }>): string {
  const cards = block.items.map(({ name, verdict, reason }) => {
    const { cardClass, badgeClass, label } = OPTION_VERDICTS[verdict]
    return `<div class="${cardClass}"><div><span class="${badgeClass}">${label}</span> <b>${htmlInlineWithCode(name)}</b></div>${htmlInlineWithCode(reason)}</div>`
  })
  return joinParts([
    block.title.trim() === "" ? "" : `**${markdownInline(block.title)}**`,
    `<div class="options">${cards.join("")}</div>`,
  ])
}

/** 2つの側を、見出しと箇条の札にして横に並べる。 */
function compareMarkdown(block: Extract<ReportBlock, { readonly kind: "compare" }>): string {
  const sides = block.sides.map(({ heading, points }) => {
    const items = points.map((point) => `<li>${htmlInlineWithCode(point)}</li>`).join("")
    return `<div class="compare-side"><div class="compare-heading">${htmlInlineWithCode(heading)}</div><ul>${items}</ul></div>`
  })
  return joinParts([
    block.title.trim() === "" ? "" : `**${markdownInline(block.title)}**`,
    `<div class="compare">${sides.join("")}</div>`,
  ])
}

/**
 * 領域を箱に、余白を帯と寸法線にして上から積み、値を右に添える。図は模式で、箱と帯の大きさは値に比例させない。
 * 領域の `size` が空なら値を置かない（`before` も出さない）。
 */
function dimensionMarkdown(block: Extract<ReportBlock, { readonly kind: "dimension" }>): string {
  const rows = block.parts.map((part) =>
    "gap" in part
      ? `<div class="dimension-gap"><span class="dimension-band" aria-hidden="true"></span>${dimensionValueMarkdown(part.gap, part.before)}</div>`
      : `<div class="dimension-part"><span class="dimension-name">${htmlInlineWithCode(part.name)}</span>${
          part.size.trim() === "" ? "" : dimensionValueMarkdown(part.size, part.before)
        }</div>`,
  )
  return joinParts([
    block.title.trim() === "" ? "" : `**${markdownInline(block.title)}**`,
    `<div class="dimension">${rows.join("")}</div>`,
  ])
}

/**
 * 画像1枚と、その下の1行。`src` は棚を引く経路で、棚に置いていない本文では付けない（描く側が「出せない」の札にする）。
 */
function imageMarkdown(
  block: Extract<ReportBlock, { readonly kind: "image" }>,
  imageSource: ReportImageSource,
  ordinal: number,
): string {
  const caption = block.caption.trim()
  const src =
    imageSource.kind === "shelved"
      ? ` src="${htmlAttribute(reportImagePath(imageSource.toolUseId, block.path))}"`
      : ""
  const alt = htmlAttribute(caption === "" ? "画面の画像" : caption)
  const numberHtml = `<span class="image-caption-number">図 ${String(ordinal)}</span>`
  const textHtml =
    caption === "" ? "" : `<span class="image-caption-text">${htmlInlineWithCode(caption)}</span>`
  const captionHtml = `<span class="image-caption">${numberHtml}${textHtml}</span>`
  return `<div class="image"><img${src} alt="${alt}">${captionHtml}</div>`
}

function dimensionValueMarkdown(value: string, before: string): string {
  const beforeHtml =
    before.trim() === ""
      ? ""
      : `<span class="dimension-before">${htmlInlineWithCode(before)} →</span> `
  return `<span class="dimension-value">${beforeHtml}${htmlInlineWithCode(value)}</span>`
}

/**
 * 1行に1ファイル。パスは `code` 要素にし、git 管理下のパスなら描く側の `Code` が押せるボタンにする
 * （パスの中の inline code の記法は解かない）。
 */
function filesMarkdown(block: Extract<ReportBlock, { readonly kind: "files" }>): string {
  const rows = block.items.map(({ path, change, note }) => {
    const noteHtml =
      note.trim() === "" ? "" : `<span class="file-note">${htmlInlineWithCode(note)}</span>`
    return `<div class="file"><span class="file-change">${FILE_CHANGE_LABELS[change]}</span><code>${htmlInline(path)}</code>${noteHtml}</div>`
  })
  return `<div class="files">${rows.join("")}</div>`
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

/** 項目を番号の丸と1本の線でつないだ `<ol>` にする。名前があれば段の頭に太字で添える。 */
function flowMarkdown(block: ListBlock): string {
  const lastIndex = block.items.length - 1
  const steps = block.items.map(({ label, text }, index) => {
    const name = label.trim() === "" ? "" : `<b>${htmlInlineWithCode(label)}</b>`
    const number = `<span class="flow-number" aria-hidden="true">${String(index + 1)}</span>`
    const rail = index === lastIndex ? "" : '<span class="flow-rail" aria-hidden="true"></span>'
    return `<li class="flow-step">${number}${rail}<span>${name}${htmlInlineWithCode(text)}</span></li>`
  })
  return `<ol class="flow" aria-label="流れ">${steps.join("")}</ol>`
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
  const bars = table.columns.map((_, index) => columnBar(table.rows, index))
  const statusColumns = table.columns.map((_, index) =>
    table.rows.some((cells) => isStatusCell(cells[index])),
  )
  const bodyCellMarkdown = (cell: ReportCell, index: number): string =>
    statusColumns[index] === true && typeof cell === "string"
      ? `<span class="cell-status-none">${cellTextMarkdown(cell)}</span>`
      : cellMarkdown(cell, bars[index] ?? NO_BAR)
  return joinParts([
    table.title.trim() === ""
      ? ""
      : `<div class="table-title">${markdownInline(table.title)}</div>`,
    [
      row(table.columns.map((column) => cellMarkdown(column, NO_BAR))),
      row(aligns.map(alignMarker)),
      ...table.rows.map((cells) => row(cells.map(bodyCellMarkdown))),
    ].join("\n"),
    tableStatusLegendMarkdown(table),
  ])
}

/** 表に出た状態のセルの状態だけを、表の下の凡例に並べる（`matrix` の凡例と同じ考え方）。 */
function tableStatusLegendMarkdown(
  table: Extract<ReportBlock, { readonly kind: "table" }>,
): string {
  const present = REPORT_CELL_STATUSES.filter((status) =>
    table.rows.some((row) => row.some((cell) => isStatusCell(cell) && cell.status === status)),
  )
  if (present.length === 0) {
    return ""
  }
  const items = present
    .map((status) => {
      const { className, symbol, label } = CELL_STATUS_MARKS[status]
      return (
        `<span class="table-status-legend-item">` +
        `<span class="table-status-legend-swatch ${className}" aria-hidden="true"></span>` +
        `<span class="cell-status-mark ${className}" aria-hidden="true">${symbol}</span> ${label}</span>`
      )
    })
    .join("")
  return `<div class="table-status-legend">${items}</div>`
}

function isStatusCell(
  cell: ReportCell | undefined,
): cell is Extract<ReportCell, { readonly status: string }> {
  return cell !== undefined && typeof cell !== "string" && "status" in cell
}

type StatItem = Extract<ReportBlock, { readonly kind: "stats" }>["items"][number]

function statMarkdown({ before, value, total, label }: StatItem): string {
  const beforeHtml =
    before.trim() === "" ? "" : `<span class="stat-before">${htmlInlineWithCode(before)} →</span>`
  const totalHtml =
    total.trim() === "" ? "" : `<span class="stat-total"> / ${htmlInlineWithCode(total)}</span>`
  return `<div class="stat">${beforeHtml}<b>${htmlInlineWithCode(value)}${totalHtml}</b>${statMeterMarkdown(value, total)}${htmlInlineWithCode(label)}</div>`
}

/** 数と全体の数がどちらも数字で、数が全体に収まるときだけ、割合の帯を返す。 */
function statMeterMarkdown(value: string, total: string): string {
  if (!NUMERIC_CELL_PATTERN.test(value) || !NUMERIC_CELL_PATTERN.test(total)) {
    return ""
  }
  const part = numericCellMagnitude(value)
  const whole = numericCellMagnitude(total)
  if (whole <= 0 || part < 0 || part > whole) {
    return ""
  }
  const width = Math.round((part / whole) * 100)
  return `<span class="stat-meter" aria-hidden="true"><span class="stat-meter-fill" style="width: ${String(width)}%"></span></span>`
}

type MatrixBlock = Extract<ReportBlock, { readonly kind: "matrix" }>
type MatrixStatus = MatrixBlock["rows"][number]["cells"][number]

/**
 * 行の名前と列の名前だけを見出しにした格子。交点は状態の印だけで、凡例は格子に出た状態だけを添える。
 * 印の名前は表の見出しの読み上げが担うので、`aria-label` は状態の語だけにする。
 */
function matrixMarkdown(block: MatrixBlock): string {
  const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`
  const grid = [
    row(["", ...block.columns.map(cellTextMarkdown)]),
    row(["---", ...block.columns.map(() => ":---:")]),
    ...block.rows.map(({ name, cells }) =>
      row([cellTextMarkdown(name), ...cells.map((status) => matrixMarkMarkdown(status, false))]),
    ),
  ].join("\n")
  const present = REPORT_MATRIX_STATUSES.filter((status) =>
    block.rows.some(({ cells }) => cells.includes(status)),
  )
  const legend = present
    .map(
      (status) =>
        `<span class="matrix-legend-item">${matrixMarkMarkdown(status, true)} ${MATRIX_MARKS[status].label}</span>`,
    )
    .join("")
  return joinParts([
    block.title.trim() === "" ? "" : `**${markdownInline(block.title)}**`,
    `<div class="matrix">\n\n${grid}\n\n<div class="matrix-legend">${legend}</div>\n\n</div>`,
  ])
}

function matrixMarkMarkdown(status: MatrixStatus, legend: boolean): string {
  const { className, symbol, label } = MATRIX_MARKS[status]
  const attributes = legend ? 'aria-hidden="true"' : `role="img" aria-label="${label}"`
  return `<span class="matrix-mark ${className}" ${attributes}>${symbol}</span>`
}

type ColumnAlign = "left" | "right"

/** 見た目だけの数字（符号・桁区切り・小数点・末尾の % を許す）。単位付きの数字は左揃えのまま。 */
const NUMERIC_CELL_PATTERN = /^-?\d[\d,]*(?:\.\d+)?%?$/

type ReportCell = Extract<ReportBlock, { readonly kind: "table" }>["rows"][number][number]

/** 列の全セルが数（前と後がどちらも数の変化を含む）なら右に揃える。それ以外は左。 */
function columnAlign(
  rows: Extract<ReportBlock, { readonly kind: "table" }>["rows"],
  index: number,
): ColumnAlign {
  const cells = rows.map((row) => row[index])
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

/** GFM の列揃えの記法（`---:`）。 */
function alignMarker(align: ColumnAlign): string {
  switch (align) {
    case "left":
      return "---"
    case "right":
      return "---:"
  }
}

type ColumnBar = { readonly kind: "none" } | { readonly kind: "bar"; readonly max: number }

const NO_BAR: ColumnBar = { kind: "none" }

/**
 * 列の全セルが素の文字列で数（`from`/`to` の変化セルを含まない）・行が2つ以上・列に負の数が無い・
 * 最大値が0より大きいときだけ、行の値を最大値に照らす棒を描く。
 */
function columnBar(
  rows: Extract<ReportBlock, { readonly kind: "table" }>["rows"],
  index: number,
): ColumnBar {
  if (rows.length < 2 || columnAlign(rows, index) !== "right") {
    return NO_BAR
  }
  const cells = rows.map((row) => row[index])
  if (!cells.every((cell): cell is string => typeof cell === "string")) {
    return NO_BAR
  }
  const magnitudes = cells.map(numericCellMagnitude)
  const max = Math.max(...magnitudes)
  return magnitudes.some((magnitude) => magnitude < 0) || max <= 0 ? NO_BAR : { kind: "bar", max }
}

/** `NUMERIC_CELL_PATTERN` に合う文字列を数値にする（桁区切りの `,` を除き、`%` は数値のまま読む）。 */
function numericCellMagnitude(text: string): number {
  return Number.parseFloat(text.replaceAll(",", ""))
}

function cellMarkdown(cell: ReportCell, bar: ColumnBar): string {
  if (typeof cell === "string") {
    return bar.kind === "bar" ? numericBarMarkdown(cell, bar.max) : cellTextMarkdown(cell)
  }
  if ("from" in cell) {
    return `<span class="change-from">${markdownInline(cell.from)} →</span> ${markdownInline(cell.to)}`.replaceAll(
      "|",
      "\\|",
    )
  }
  const status = CELL_STATUS_MARKS[cell.status]
  const text = cell.text.trim()
  const mark = `<span class="cell-status-mark ${status.className}" role="img" aria-label="${status.label}">${status.symbol}</span>`
  const body = `${mark}<span class="cell-status-text">${markdownInline(text === "" ? status.label : text)}</span>`
  return `<span class="cell-status ${status.className}">${body}</span>`.replaceAll("|", "\\|")
}

function cellTextMarkdown(cell: string): string {
  return markdownInline(cell).replaceAll("|", "\\|")
}

/** 数だけの列のセルを、列の最大値に対する幅の棒と数字を重ねた印にする。 */
function numericBarMarkdown(cell: string, max: number): string {
  const width = Math.round((numericCellMagnitude(cell) / max) * 100)
  return `<span class="cell-numeric"><span class="cell-bar" style="width: ${String(width)}%"></span><span class="cell-numeric-value">${markdownInline(cell)}</span></span>`.replaceAll(
    "|",
    "\\|",
  )
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
