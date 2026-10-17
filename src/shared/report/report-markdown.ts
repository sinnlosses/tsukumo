// 節の並びから Markdown を組む決まり。塊の文字の逃がし方もここが持つ。
//
// 塊の文字は、描くときに Markdown か HTML の中へ埋める。
// Markdown に埋める文字は行頭の塊の記法と `<` を逃がして改行を畳み、許すのはインラインの記法（inline code・太字・リンク）だけにする。
// 逃げ道の `markdown` の塊だけは逃がさず、今の本文と同じ経路（許可リスト・mermaid・`chart`）で描く。

import { countBy } from "remeda"

import { encodeMarks } from "./code-mark.ts"
import { readGraphSource, type GraphChange, type GraphNodeShape } from "./graph-source.ts"
import {
  REPORT_CELL_STATUSES,
  REPORT_MATRIX_STATUSES,
  type ReportBlock,
  type ReportGraph,
  type ReportSection,
} from "./report-block.ts"
import { fileTreeRows } from "./report-file-tree.ts"
import { reportImagePath } from "./report-image.ts"
import { REPORT_NOTE_KINDS } from "./report-notation.ts"

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

/** 題に番号を振る塊の分類。図は題が本体の下、表は題が本体の上。 */
type CaptionKind = "figure" | "table"

type CaptionCounts = Readonly<Record<CaptionKind, number>>

const CAPTION_LABELS = {
  figure: "図",
  table: "表",
} satisfies Record<CaptionKind, string>

type SectionsFold = {
  readonly parts: readonly string[]
  readonly counts: CaptionCounts
}

/** 本文の位置に描く塊1つと、その塊に添える傍注（余白の柱に置くもの）。`body` が空なら傍注だけ。 */
type GutterGroup = {
  readonly body: string
  readonly notes: readonly string[]
}

/**
 * 節の並びを1つの Markdown に組む。空の塊・空の節は置かず、節の間に {@link SECTION_BREAK_MARKDOWN} を挟む。
 * 題を持つ塊（図 6種・表 2種）は、節をまたいで並びの順に数えた「図 n」「表 n」の番号を1回だけ受け取る（{@link foldedBlockMarkdown}）。
 * 番号は題が空でも、`fold` の中でも数える。
 * 塊の `aside` と `memo` の `note` は傍注になり、直前の塊と一緒に包む（{@link gutterGroupMarkdown}）。
 * `memo` の `note` は本文の位置に残さない。節の最初の `memo` は塊の無い包みになる。
 */
export function reportSectionsMarkdown(
  sections: readonly ReportSection[],
  imageSource: ReportImageSource,
): string {
  const { parts } = sections.reduce<SectionsFold>(
    (acc, section) => {
      const blocks = section.blocks.reduce<{
        readonly groups: readonly GutterGroup[]
        readonly counts: CaptionCounts
      }>(
        (blockAcc, block) => {
          const kind = captionKindOf(block)
          const counts =
            kind === undefined
              ? blockAcc.counts
              : { ...blockAcc.counts, [kind]: blockAcc.counts[kind] + 1 }
          const ordinal = kind === undefined ? 0 : counts[kind]
          const notes = gutterNotesOf(block)
          const last = blockAcc.groups.at(-1)
          return {
            groups:
              isMemoNote(block) && last !== undefined
                ? [...blockAcc.groups.slice(0, -1), { ...last, notes: [...last.notes, ...notes] }]
                : [
                    ...blockAcc.groups,
                    { body: foldedBlockMarkdown(block, imageSource, ordinal), notes },
                  ],
            counts,
          }
        },
        { groups: [], counts: acc.counts },
      )
      const part = joinParts([
        section.heading.trim() === "" ? "" : `## ${markdownInline(section.heading)}`,
        ...blocks.groups.map(gutterGroupMarkdown),
      ])
      return {
        parts: part.trim() === "" ? acc.parts : [...acc.parts, part],
        counts: blocks.counts,
      }
    },
    { parts: [], counts: { figure: 0, table: 0 } },
  )
  return parts.join(`\n\n${SECTION_BREAK_MARKDOWN}\n\n`)
}

/**
 * HTML の中に埋める1行の文字。改行を空白に畳み、HTML として逃がす（Markdown の記法は効かない）。
 */
export function htmlInline(text: string): string {
  return escapeHtml(text.replace(/\s+/g, " ").trim())
}

/** 二重引用符で囲む HTML 属性の値に埋める1行の文字。`htmlInline` に加えて `"` も逃がす。 */
export function htmlAttribute(text: string): string {
  return htmlInline(text).replaceAll('"', "&quot;")
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
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

/** 候補の判定 → 行の class と、頭に出す語。「採る」は筆を留める対象。 */
const OPTION_VERDICTS = {
  adopt: { rowClass: `option option-adopt ${PAUSE_POINT_CLASS_NAME}`, label: "採る" },
  consider: { rowClass: "option option-consider", label: "検討" },
  reject: { rowClass: "option option-reject", label: "採らない" },
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "options" }>["items"][number]["verdict"],
  { readonly rowClass: string; readonly label: string }
>

/** ファイルの変更の種別 → 札の記号・語・見た目の class（色は `report-notation.module.css` 側が持つ）。 */
const FILE_CHANGE_BADGES = {
  added: { symbol: "+", label: "追加", className: "file-change-added" },
  modified: { symbol: "~", label: "変更", className: "file-change-modified" },
  deleted: { symbol: "-", label: "削除", className: "file-change-deleted" },
  read: { symbol: "·", label: "読んだ", className: "file-change-read" },
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "files" }>["items"][number]["change"],
  { readonly symbol: string; readonly label: string; readonly className: string }
>

/** 塊の頭の合計の札と、行ごとの札を並べる順。 */
const FILE_CHANGE_ORDER = [
  "added",
  "modified",
  "deleted",
  "read",
] as const satisfies readonly (keyof typeof FILE_CHANGE_BADGES)[]

/**
 * 本文の位置に描く `note` の種別 → 記法の class。ラベルは描く側が class から引く（`REPORT_NOTE_KINDS`）。注意・異常は筆を留める対象。
 * `memo` は傍注になる（{@link gutterNotesOf}）。
 */
const NOTE_CLASSES = {
  info: "note",
  warn: `note note-warn ${PAUSE_POINT_CLASS_NAME}`,
  ng: `note note-ng ${PAUSE_POINT_CLASS_NAME}`,
  ask: "note note-ask",
} as const satisfies Record<
  Exclude<Extract<ReportBlock, { readonly kind: "note" }>["tone"], "memo">,
  string
>

/** 傍注にした `memo` の頭に付けるラベル。 */
const MEMO_LABEL = new Map(REPORT_NOTE_KINDS).get("note-memo") ?? ""

/** inline code（開きと同じ数のバッククォートで閉じる）。中の文字は逃がさない。 */
const CODE_SPAN = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g

/** 番号付きリストの頭（`1.` / `1)`）。1つ目が番号、2つ目が区切りの記号。 */
const ORDERED_LIST_START = /^(\d{1,9})([.)])(?=\s|$)/

function joinParts(parts: readonly string[]): string {
  return parts.filter((part) => part.trim() !== "").join("\n\n")
}

function isMemoNote(block: ReportBlock): boolean {
  return block.kind === "note" && block.tone === "memo"
}

/** 塊の傍注。`memo` の `note` は本文を「メモ」のラベル付きで、塊の `aside` はそのあとに置く。 */
function gutterNotesOf(block: ReportBlock): readonly string[] {
  return [
    ...(block.kind === "note" && block.tone === "memo"
      ? [gutterNoteMarkdown(MEMO_LABEL, block.text)]
      : []),
    gutterNoteMarkdown("", block.aside),
  ].filter((note) => note !== "")
}

function gutterNoteMarkdown(label: string, text: string): string {
  if (text.trim() === "") {
    return ""
  }
  const labelHtml = label === "" ? "" : `<span class="gutter-note-label">${label}</span>`
  return `<aside class="gutter-note">\n\n${labelHtml}${markdownInline(text)}\n\n</aside>`
}

function gutterGroupMarkdown({ body, notes }: GutterGroup): string {
  if (notes.length === 0) {
    return body
  }
  return joinParts([
    '<div class="with-gutter">',
    body,
    joinParts(['<div class="gutter">', ...notes, "</div>"]),
    "</div>",
  ])
}

function foldedBlockMarkdown(
  block: ReportBlock,
  imageSource: ReportImageSource,
  ordinal: number,
): string {
  const markdown = blockMarkdown(block, imageSource, ordinal)
  return block.fold.trim() === "" || markdown.trim() === ""
    ? markdown
    : `<details><summary>${htmlInline(block.fold)}</summary>\n\n${markdown}\n\n</details>`
}

function blockMarkdown(
  block: ReportBlock,
  imageSource: ReportImageSource,
  ordinal: number,
): string {
  switch (block.kind) {
    case "text":
      return markdownInline(block.text)
    case "list":
      return listMarkdown(block)
    case "table":
      return tableMarkdown(block, ordinal)
    case "matrix":
      return matrixMarkdown(block, ordinal)
    case "compare":
      return compareMarkdown(block, ordinal)
    case "beforeAfter":
      return beforeAfterMarkdown(block, imageSource, ordinal)
    case "dimension":
      return dimensionMarkdown(block, ordinal)
    case "note":
      return block.tone === "memo" || block.text.trim() === ""
        ? ""
        : `<div class="${NOTE_CLASSES[block.tone]}">\n\n${markdownInline(block.text)}\n\n</div>`
    case "stats":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: "",
        body: `<div class="stats">${block.items.map(statMarkdown).join("")}</div>`,
        bodyFormat: "html",
        fit: false,
      })
    case "code":
      return fencedMarkdown(codeInfo(block), block.source)
    case "mermaid":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: block.title,
        body: fencedMarkdown("mermaid", withSequenceAutonumber(block.source)),
        bodyFormat: "markdown",
        fit: false,
      })
    case "graph":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: block.title,
        body: joinParts([
          fencedMarkdown("mermaid", graphSource(block)),
          graphLegendMarkdown(block),
        ]),
        bodyFormat: "markdown",
        fit: false,
      })
    case "chart":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: block.title,
        body: fencedMarkdown("chart", JSON.stringify(chartConfigOf(block))),
        bodyFormat: "markdown",
        fit: false,
      })
    case "svg":
      return captionedMarkdown({
        kind: "figure",
        ordinal,
        title: block.title,
        body: svgHtml(block),
        bodyFormat: "html",
        fit: true,
      })
    case "progress":
      return progressMarkdown(block)
    case "options":
      return optionsMarkdown(block)
    case "image":
      return imageMarkdown(block, imageSource, ordinal)
    case "files":
      return ordinal === 0
        ? filesMarkdown(block)
        : captionedMarkdown({
            kind: "figure",
            ordinal,
            title: block.title,
            body: filesMarkdown(block),
            bodyFormat: "html",
            fit: false,
          })
    case "markdown":
      return block.markdown
  }
}

function captionKindOf(block: ReportBlock): CaptionKind | undefined {
  switch (block.kind) {
    case "image":
    case "dimension":
    case "compare":
    case "beforeAfter":
    case "mermaid":
    case "graph":
    case "chart":
    case "svg":
    case "stats":
      return "figure"
    case "table":
    case "matrix":
      return "table"
    case "files":
      return block.title.trim() === "" ? undefined : "figure"
    default:
      return undefined
  }
}

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
 * `swap` は包みに、前と後を同じ位置で入れ替える口の印（`before-after-swap`）を付ける。
 */
function captionedMarkdown(
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

type ChartConfig = {
  readonly type: string
  readonly data: {
    readonly labels: readonly string[]
    readonly datasets: readonly (
      | { readonly label: string; readonly data: readonly number[] }
      | {
          readonly label: string
          readonly data: readonly (readonly [number, number])[]
          readonly barThickness: number
        }
    )[]
  }
  readonly options:
    | { readonly indexAxis: "y" }
    | Record<string, never>
    | { readonly indexAxis: "y"; readonly plugins: DirectLabelPlugins }
    | {
        readonly scales: { readonly y: { readonly display: false } }
        readonly plugins: DirectLabelPlugins
      }
}

type DirectLabelPlugins = {
  readonly "tsukumo-direct-label": {
    readonly mode: "arrow" | "slope"
    readonly names: readonly string[]
  }
}

const ARROW_BAR_THICKNESS = 4

/**
 * `chart` の塊から Chart.js の設定を組む。色は書かない。`pie` は `series` の先頭だけを描く。
 * `arrow` は前→後を浮き棒1本ずつ、`slope` は項目ごとに前→後の線1本にして、描く側の plugin に系列名を渡す。
 */
function chartConfigOf(block: Extract<ReportBlock, { readonly kind: "chart" }>): ChartConfig {
  if (block.chartKind === "arrow" || block.chartKind === "slope") {
    const [before, after] = block.series
    const names = [before?.name ?? "", after?.name ?? ""]
    const pairAt = (index: number): readonly [number, number] => [
      before?.values[index] ?? 0,
      after?.values[index] ?? 0,
    ]
    const plugins = { "tsukumo-direct-label": { mode: block.chartKind, names } }
    return block.chartKind === "arrow"
      ? {
          type: "bar",
          data: {
            labels: [...block.labels],
            datasets: [
              {
                label: names.join(" → "),
                data: block.labels.map((_, index) => pairAt(index)),
                barThickness: ARROW_BAR_THICKNESS,
              },
            ],
          },
          options: { indexAxis: "y", plugins },
        }
      : {
          type: "line",
          data: {
            labels: names,
            datasets: block.labels.map((label, index) => ({
              label,
              data: [...pairAt(index)],
            })),
          },
          options: { scales: { y: { display: false } }, plugins },
        }
  }
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

/**
 * 候補を書き手の順のまま1案1行にし、番号・判定の語・名前・理由の順に並べる。
 * 採る → 検討 → 採らないの順は書き手が守り、崩れていれば `reportViolations` が差し戻す（並べ替えは再構成になるのでしない）。
 */
function optionsMarkdown(block: Extract<ReportBlock, { readonly kind: "options" }>): string {
  const rows = block.items.map(({ name, verdict, reason }, index) => {
    const { rowClass, label } = OPTION_VERDICTS[verdict]
    const reasonHtml =
      reason === "" ? "" : ` <span class="option-reason">${htmlInlineWithCode(reason)}</span>`
    return `<div class="${rowClass}"><span class="option-number">${String(index + 1)}</span><span class="option-verdict">${label}</span><span class="option-body"><span class="option-name">${htmlInlineWithCode(name)}</span>${reasonHtml}</span></div>`
  })
  return joinParts([
    block.title.trim() === "" ? "" : `**${markdownInline(block.title)}**`,
    `<div class="options">${rows.join("")}</div>`,
  ])
}

/** 2つの側を、見出しと箇条の札にして横に並べる。 */
function compareMarkdown(
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
function beforeAfterMarkdown(
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
      return `<img${reportImageSrcAttribute(imageSource, content.path)} alt="${htmlAttribute(alt)}">`
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

type SvgFigure = {
  readonly width: number
  readonly height: number
  readonly shapes: readonly SvgShape[]
}

type SvgShape = Extract<ReportBlock, { readonly kind: "svg" }>["shapes"][number]

const SVG_ARROW_MARKER_ID = "report-svg-arrow"

const SVG_LABEL_FONT_SIZE = 14

/**
 * 図形を `<svg viewBox="0 0 W H">` の1行に組む（空行を挟むと Markdown の HTML の塊が切れる）。
 * 色は書かない。`report-svg-figure` の下の要素に CSS が当てる（強調の枠だけ `stroke-width` の属性が目印）。
 */
function svgHtml({ width, height, shapes }: SvgFigure): string {
  const w = String(width)
  const h = String(height)
  const marker =
    `<defs><marker id="${SVG_ARROW_MARKER_ID}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">` +
    `<path d="M0,0 L10,5 L0,10 z"></path></marker></defs>`
  const body = shapes.map(svgShapeHtml).join("")
  return `<div class="svg-figure"><svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${marker}${body}</svg></div>`
}

function svgShapeHtml(shape: SvgShape): string {
  switch (shape.kind) {
    case "rect": {
      const strokeWidth = shape.emphasis ? ' stroke-width="3"' : ""
      const rect = `<rect x="${String(shape.x)}" y="${String(shape.y)}" width="${String(shape.width)}" height="${String(shape.height)}" rx="4"${strokeWidth}></rect>`
      return shape.label.trim() === ""
        ? rect
        : rect +
            svgTextHtml(shape.x + shape.width / 2, shape.y + shape.height / 2, shape.label, {
              centered: true,
            })
    }
    case "line": {
      const markerEnd = shape.arrow ? ` marker-end="url(#${SVG_ARROW_MARKER_ID})"` : ""
      const line = `<line x1="${String(shape.x1)}" y1="${String(shape.y1)}" x2="${String(shape.x2)}" y2="${String(shape.y2)}"${markerEnd}></line>`
      return shape.label.trim() === ""
        ? line
        : line +
            svgTextHtml((shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2 - 6, shape.label, {
              centered: true,
            })
    }
    case "text":
      return svgTextHtml(shape.x, shape.y, shape.text, { centered: false })
  }
}

function svgTextHtml(
  x: number,
  y: number,
  text: string,
  { centered }: { readonly centered: boolean },
): string {
  const anchor = centered ? ' text-anchor="middle" dominant-baseline="middle"' : ""
  return `<text x="${String(x)}" y="${String(y)}" font-size="${String(SVG_LABEL_FONT_SIZE)}"${anchor}>${htmlInline(text)}</text>`
}

/**
 * 領域を箱に、余白を帯と寸法線にして上から積み、値を右に添える。図は模式で、箱と帯の大きさは値に比例させない。
 * 領域の `size` が空なら値を置かない（`before` も出さない）。
 */
function dimensionMarkdown(
  block: Extract<ReportBlock, { readonly kind: "dimension" }>,
  ordinal: number,
): string {
  const rows = block.parts.map((part) =>
    "gap" in part
      ? `<div class="dimension-gap"><span class="dimension-band" aria-hidden="true"></span>${dimensionValueMarkdown(part.gap, part.before)}</div>`
      : `<div class="dimension-part"><span class="dimension-name">${htmlInlineWithCode(part.name)}</span>${
          part.size.trim() === "" ? "" : dimensionValueMarkdown(part.size, part.before)
        }</div>`,
  )
  return captionedMarkdown({
    kind: "figure",
    ordinal,
    title: block.title,
    body: `<div class="dimension">${rows.join("")}</div>`,
    bodyFormat: "html",
    fit: true,
  })
}

/**
 * 画像1枚と、その下の題の行。`src` は棚を引く経路で、棚に置いていない本文では付けない（描く側が「出せない」の札にする）。
 * `notes` があれば、画像の横に1始まりの番号を振った説明の並びを置き、包みは縮めない。
 */
function imageMarkdown(
  block: Extract<ReportBlock, { readonly kind: "image" }>,
  imageSource: ReportImageSource,
  ordinal: number,
): string {
  const caption = block.caption.trim()
  const alt = htmlAttribute(caption === "" ? "画面の画像" : caption)
  const image = `<img${reportImageSrcAttribute(imageSource, block.path)} alt="${alt}">`
  const annotated = block.notes.length > 0
  return captionedMarkdown({
    kind: "figure",
    ordinal,
    title: caption,
    body: annotated
      ? `<div class="image-notes">${image}${imageNoteListMarkdown(block.notes)}</div>`
      : image,
    bodyFormat: "html",
    fit: !annotated,
  })
}

/** `img` の `src` 属性（前の空白つき）。棚に置いていない本文では空にし、描く側が「出せない」の札にする。 */
function reportImageSrcAttribute(imageSource: ReportImageSource, path: string): string {
  return imageSource.kind === "shelved"
    ? ` src="${htmlAttribute(reportImagePath(imageSource.toolUseId, path))}"`
    : ""
}

function imageNoteListMarkdown(notes: readonly string[]): string {
  const items = notes.map(
    (note, index) =>
      `<li><span class="image-note-number" aria-hidden="true">${String(index + 1)}</span>` +
      `<span class="image-note-text">${htmlInlineWithCode(note)}</span></li>`,
  )
  return `<ol class="image-note-list">${items.join("")}</ol>`
}

function dimensionValueMarkdown(value: string, before: string): string {
  const beforeHtml =
    before.trim() === ""
      ? ""
      : `<span class="dimension-before">${htmlInlineWithCode(before)} →</span> `
  return `<span class="dimension-value">${beforeHtml}${htmlInlineWithCode(value)}</span>`
}

/**
 * 塊の頭に、種別ごとの合計の札を右寄せで並べ、パスから組んだ樹形図の行（フォルダの行・ファイルの行）を続ける。
 * ファイル名は `code` 要素にし、フルパスを `data-file-path` に持たせる。git 管理下のパスなら描く側の `Code` が
 * その属性で判定して押せるボタンにする（パスの中の inline code の記法は解かない）。
 * 枝の罫は読み上げに出さない。フォルダの無いパスだけのときは罫もフォルダの行も出さない。
 */
function filesMarkdown(block: Extract<ReportBlock, { readonly kind: "files" }>): string {
  const summaryHtml = filesSummaryHtml(block.items)
  const rows = fileTreeRows(block.items, (item) => item.path).map((row) => {
    if (row.kind === "folder") {
      const nameHtml = pathBreakHtml(htmlInline(row.name))
      return `<div class="file-folder">${fileGuideHtml(row.guide)}<span class="file-path-folder">${nameHtml}</span></div>`
    }
    const { path, change, note } = row.item
    const nameHtml = `<span class="file-path-name">${pathBreakHtml(htmlInline(row.name))}</span>`
    const noteHtml = fileNoteHtml(change, note)
    const badgeHtml = fileChangeBadgeHtml(change, "")
    if (row.guide === "" && !path.includes("/")) {
      return `<div class="file">${badgeHtml}<code>${nameHtml}</code>${noteHtml}</div>`
    }
    const codeHtml = `<code data-file-path="${htmlAttribute(path)}">${nameHtml}</code>`
    return `<div class="file">${badgeHtml}<span class="file-entry">${fileGuideHtml(row.guide)}${codeHtml}</span>${noteHtml}</div>`
  })
  return `<div class="files">${rows.join("")}${summaryHtml}</div>`
}

/**
 * パスの折り返しの機会を `/` の直後だけにする。
 * `/` の後に `<wbr>` を置き、ハイフンの後は空の `path-glue`（CSS が見えない結合子を付けて折れなくする）を置く。
 */
function pathBreakHtml(escapedPath: string): string {
  return escapedPath.replaceAll("/", "/<wbr>").replaceAll("-", '-<span class="path-glue"></span>')
}

function fileGuideHtml(guide: string): string {
  return guide === "" ? "" : `<span class="file-branch" aria-hidden="true">${guide}</span>`
}

/** 種別ごとの件数が1つでもある札だけを、`FILE_CHANGE_ORDER` の順で並べる。 */
function filesSummaryHtml(
  items: Extract<ReportBlock, { readonly kind: "files" }>["items"],
): string {
  const counts = countBy(items, (item) => item.change)
  const badges = FILE_CHANGE_ORDER.filter((change) => (counts[change] ?? 0) > 0).map((change) =>
    fileChangeBadgeHtml(change, ` ${counts[change]}`),
  )
  return `<div class="files-summary">${badges.join("")}</div>`
}

function fileChangeBadgeHtml(change: keyof typeof FILE_CHANGE_BADGES, countSuffix: string): string {
  const badge = FILE_CHANGE_BADGES[change]
  return (
    `<span class="file-change ${badge.className}">` +
    `<span class="file-change-symbol">${badge.symbol}</span>${badge.label}${countSuffix}</span>`
  )
}

/** 追加で説明が無い行は「新しく作った」を補足色で入れ、ほかの種別で説明が無い行は列を空にする。 */
function fileNoteHtml(change: keyof typeof FILE_CHANGE_BADGES, note: string): string {
  if (note.trim() !== "") {
    return `<span class="file-note">${htmlInlineWithCode(note)}</span>`
  }
  return change === "added" ? '<span class="file-note file-note-empty">新しく作った</span>' : ""
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

function tableMarkdown(
  table: Extract<ReportBlock, { readonly kind: "table" }>,
  ordinal: number,
): string {
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
  return captionedMarkdown({
    kind: "table",
    ordinal,
    title: table.title,
    body: joinParts([
      tableStatusLegendMarkdown(table),
      [
        row(table.columns.map((column) => cellMarkdown(column, NO_BAR))),
        row(aligns.map(alignMarker)),
        ...table.rows.map((cells) => row(cells.map(bodyCellMarkdown))),
      ].join("\n"),
      table.rest.trim() === ""
        ? ""
        : `<div class="table-rest">${htmlInlineWithCode(table.rest)}</div>`,
    ]),
    bodyFormat: "markdown",
    fit: true,
  })
}

/** 表に出た状態のセルの状態だけを、題と表のあいだの凡例に並べる（`matrix` の凡例と同じ考え方）。 */
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

function statMarkdown({ before, value, total, label, series, better }: StatItem): string {
  const beforeHtml =
    before.trim() === ""
      ? ""
      : `<span class="${statBeforeClass(before, value, better)}">${htmlInlineWithCode(before)} →</span>`
  const totalHtml =
    total.trim() === "" ? "" : `<span class="stat-total"> / ${htmlInlineWithCode(total)}</span>`
  return `<div class="stat">${beforeHtml}<b>${statSparkMarkdown(series)}${htmlInlineWithCode(value)}${totalHtml}</b>${statMeterMarkdown(value, total)}${htmlInlineWithCode(label)}</div>`
}

/** 前と後がどちらも数で `better` があるときだけ、増減が良い向きなら `stat-better`・逆なら `stat-worse` を足す。差は計算しない。 */
function statBeforeClass(before: string, value: string, better: StatItem["better"]): string {
  if (better === "" || !NUMERIC_CELL_PATTERN.test(before) || !NUMERIC_CELL_PATTERN.test(value)) {
    return "stat-before"
  }
  const from = numericCellMagnitude(before)
  const to = numericCellMagnitude(value)
  if (from === to) {
    return "stat-before"
  }
  const improved = better === "up" ? to > from : to < from
  return improved ? "stat-before stat-better" : "stat-before stat-worse"
}

const STAT_SPARK_WIDTH = 48
const STAT_SPARK_HEIGHT = 12
const STAT_SPARK_MARGIN = 1.5
const STAT_SPARK_MIN_POINTS = 3

/** 3つ以上の数の並びを、語の高さの折れ線（最新の点だけ円）にする。最大が上、全部同じなら中央。 */
function statSparkMarkdown(series: readonly number[]): string {
  if (series.length < STAT_SPARK_MIN_POINTS) {
    return ""
  }
  const low = Math.min(...series)
  const high = Math.max(...series)
  const round = (number: number): string => String(Math.round(number * 10) / 10)
  const points = series.map((number, index) => ({
    x:
      STAT_SPARK_MARGIN +
      (index * (STAT_SPARK_WIDTH - 2 * STAT_SPARK_MARGIN)) / (series.length - 1),
    y:
      high === low
        ? STAT_SPARK_HEIGHT / 2
        : STAT_SPARK_MARGIN +
          ((high - number) / (high - low)) * (STAT_SPARK_HEIGHT - 2 * STAT_SPARK_MARGIN),
  }))
  const last = points.at(-1)
  if (last === undefined) {
    return ""
  }
  const path = points.map(({ x, y }) => `${round(x)},${round(y)}`).join(" ")
  return (
    `<svg viewBox="0 0 ${String(STAT_SPARK_WIDTH)} ${String(STAT_SPARK_HEIGHT)}" aria-hidden="true">` +
    `<polyline points="${path}"/>` +
    `<circle cx="${round(last.x)}" cy="${round(last.y)}" r="1.2"/></svg>`
  )
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
function matrixMarkdown(block: MatrixBlock, ordinal: number): string {
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
  return captionedMarkdown({
    kind: "table",
    ordinal,
    title: block.title,
    body: `<div class="matrix">\n\n${grid}\n\n<div class="matrix-legend">${legend}</div>\n\n</div>`,
    bodyFormat: "markdown",
    fit: true,
  })
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
 * `code` の塊のフェンスの info。先頭の語は言語として読まれるので、言語が空でパスか印があるときは `text` で埋める
 * （埋めないとパスや印の語が言語になり、`marks` が描画側へ届かない）。
 */
function codeInfo(block: Extract<ReportBlock, { readonly kind: "code" }>): string {
  const rest = [block.path, block.marks.length === 0 ? "" : encodeMarks(block.marks)].filter(
    (part) => part.trim() !== "",
  )
  const language = block.language.trim() === "" && rest.length > 0 ? "text" : block.language
  return [language, ...rest].filter((part) => part.trim() !== "").join(" ")
}

/**
 * フェンスで囲む。フェンスは中身に出てくるバッククォートの並びより長くする（中身で閉じないように）。
 */
function fencedMarkdown(info: string, source: string): string {
  const longest = Math.max(0, ...[...source.matchAll(/`+/g)].map(([run]) => run.length))
  const fence = "`".repeat(Math.max(3, longest + 1))
  return `${fence}${info}\n${source.replace(/\n$/, "")}\n${fence}`
}

/** 本文から「3 の呼び出し」と指せるよう、時系列の図の矢印に通し番号を振る。書き手が `autonumber` を書いていれば足さない。 */
function withSequenceAutonumber(source: string): string {
  const [head = "", ...rest] = source.split("\n")
  if (head.trim() !== "sequenceDiagram" || rest.some((line) => /^\s*autonumber\b/.test(line))) {
    return source
  }
  return ["sequenceDiagram", "  autonumber", ...rest].join("\n")
}

/**
 * 書き手の名前は辺を結ぶためだけに使い、ソースの ID は `n0`, `n1` … を振る（`end` などの予約語を避ける）。
 * ラベルは節点も辺も必ず引用符で包む（`@`・`(`・`|` などを構文と読ませない）。
 * 読めない行は呼び出し側が先に差し戻す前提で、ここでは飛ばす。
 */
function graphSource(block: ReportGraph): string {
  const { nodes, edges, groups } = readGraphSource(block.source)
  const mermaidId = (index: number): string => `n${String(index)}`
  const quoted = (label: string): string =>
    `"${label.replaceAll('"', "#quot;").replaceAll("`", "#96;")}"`
  const nodeLine = (index: number, indent: string): string => {
    const node = nodes[index]
    if (node === undefined) {
      return ""
    }
    const label = quoted(node.name)
    const id = mermaidId(index)
    switch (node.shape) {
      case "box":
        return `${indent}${id}[${label}]`
      case "round":
        return `${indent}${id}([${label}])`
      case "decision":
        return `${indent}${id}{${label}}`
    }
  }
  const grouped = new Set(groups.flatMap((group) => group.nodes))
  const nodeLines = [
    ...nodes.flatMap((_, index) => (grouped.has(index) ? [] : [nodeLine(index, "  ")])),
    ...groups.flatMap((group, index) => [
      `  subgraph g${String(index)}[${quoted(group.name)}]`,
      ...group.nodes.map((at) => nodeLine(at, "    ")),
      "  end",
    ]),
  ]
  const groupStyleLines = groups.map((_, index) => `  style g${String(index)} ${GRAPH_GROUP_STYLE}`)
  const edgeLines = edges.map((edge) => {
    const arrow = edge.label === "" ? "-->" : `-->|${quoted(edge.label)}|`
    return `  ${mermaidId(edge.from)} ${arrow} ${mermaidId(edge.to)}`
  })
  const changes = new Set([...nodes, ...edges].map(({ change }) => change))
  const classDefLines = GRAPH_CHANGES.filter(({ change }) => changes.has(change)).map(
    ({ change, color, dashed }) => `  classDef ${change} ${graphStroke(color, dashed, 3)}`,
  )
  const classLines = nodes.flatMap((node, index) =>
    node.change === "unchanged" ? [] : [`  class ${mermaidId(index)} ${node.change}`],
  )
  const linkStyleLines = edges.flatMap((edge, index) => {
    const style = GRAPH_CHANGES.find(({ change }) => change === edge.change)
    return style === undefined
      ? []
      : [`  linkStyle ${String(index)} ${graphStroke(style.color, style.dashed, 2)}`]
  })
  return [
    `flowchart ${block.direction}`,
    ...nodeLines,
    ...edgeLines,
    ...groupStyleLines,
    ...classDefLines,
    ...classLines,
    ...linkStyleLines,
  ].join("\n")
}

/** 印の色はテーマのトークンで書き、`var(--…)` のまま渡す（hex への解決は `MermaidBlock`）。 */
const GRAPH_CHANGES = [
  { change: "added", color: "--state-ok", label: "足した", dashed: false },
  { change: "removed", color: "--state-ng", label: "消した", dashed: true },
  { change: "changed", color: "--state-warn", label: "変えた", dashed: false },
] as const satisfies readonly {
  readonly change: GraphChange
  readonly color: string
  readonly label: string
  readonly dashed: boolean
}[]

const GRAPH_GROUP_STYLE =
  "fill:var(--surface-raised),stroke:var(--rule-quiet),stroke-width:1px,stroke-dasharray:5 4"

const GRAPH_SHAPES = [
  { shape: "round", label: "入口・出口" },
  { shape: "box", label: "処理" },
  { shape: "decision", label: "分岐" },
] as const satisfies readonly { readonly shape: GraphNodeShape; readonly label: string }[]

function graphStroke(color: string, dashed: boolean, width: number): string {
  const dash = dashed ? ",stroke-dasharray:5 4" : ""
  return `stroke:var(${color}),stroke-width:${String(width)}px${dash}`
}

function graphLegendMarkdown(block: ReportGraph): string {
  const { nodes, edges } = readGraphSource(block.source)
  const shapes = GRAPH_SHAPES.filter(({ shape }) => nodes.some((node) => node.shape === shape))
  const shapeItems = shapes.length < 2 ? [] : shapes
  const changeItems = [...nodes, ...edges].every(({ change }) => change === "unchanged")
    ? []
    : GRAPH_CHANGES
  const items = [
    ...shapeItems.map(
      ({ shape, label }) =>
        `<span class="graph-legend-item"><span class="graph-legend-shape graph-legend-shape-${shape}" aria-hidden="true"></span>${label}</span>`,
    ),
    ...changeItems.map(
      ({ change, label }) =>
        `<span class="graph-legend-item"><span class="graph-legend-swatch graph-legend-${change}" aria-hidden="true"></span>${label}</span>`,
    ),
  ]
  return items.length === 0 ? "" : `<div class="graph-legend">${items.join("")}</div>`
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
