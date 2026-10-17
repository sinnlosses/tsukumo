// `report` ツールで受け取ったレポートの検査（「検査 → 整形 → 描画」の検査の段）。
//
// 検査するのは「レポートの記法」（`REPORT_NOTATION_PROMPT`）の条のうち、機械で判定できるものだけ。
// 読み手によって結論が変わる条（効能書き・根拠の量・前置きと締めの行など）は入れない。
// 誤って差し戻すと、直しようのない指摘でモデルを1往復させることになる。
//
// 本文は節と塊の並びで届くので、塊の種類ごとに数える。

import { keys } from "remeda"

import {
  type RecordedReportFigure,
  type ReportBlock,
  type ReportSection,
  sectionsWithFigure,
} from "../../../shared/report/report-block.ts"
import type { ReportCheck } from "../../../shared/report/report-check.ts"
import {
  MAX_CANDIDATES,
  MAX_CONCLUSION_SENTENCES,
  MAX_FIRST_SENTENCE,
  MAX_HEADING,
  MAX_ITEM_LABEL,
} from "../../../shared/report/report-limit.ts"
import type { ReportTask } from "../../../shared/report/report-task.ts"
import { leadingSentences, sentenceCount } from "../../../shared/report/sentence-count.ts"
import type { WorkPlanClosing } from "../../../shared/session/work-plan.ts"
import { codeBlockMatchesFile } from "./code-block-match.ts"
import {
  type GraphFault,
  graphFaultPositions,
  graphFaultsInSections,
  type MermaidFault,
  mermaidFaultPositions,
  type SvgFault,
  svgFaultPositions,
  svgFaultsInSections,
  unknownMermaidCount,
} from "./report-figure-fault.ts"
import {
  hasNestedFold,
  type MarkdownNotation,
  MARKDOWN_NOTATION_NAMES,
  notationsInSections,
  paragraphs,
  splitFences,
} from "./report-markdown-notation.ts"

/** 検査にかけるレポート。`sections` と `checks` の「無い」は空の配列、`favor` の「無い」は空の文字列。 */
export type ReportDraft = {
  readonly conclusion: string
  readonly figure: RecordedReportFigure
  readonly sections: readonly ReportSection[]
  readonly favor: string
  readonly checks: readonly ReportCheck[]
  /** `code` の塊の `path` → 読めたファイルの中身。読めなかった `path` は入らない。 */
  readonly fileContents: ReadonlyMap<string, string>
  /** 構文が割れた `mermaid` の塊（`figure` を含む）。検査できなかったときも、割れた塊が無いときも空。 */
  readonly mermaidFaults: readonly MermaidFault[]
  /** 載せたタスク。記法の検査には使わず、段の残りの差し戻し（`ReportReview`）が終わり方を読む。 */
  readonly task: ReportTask
  /** 段の閉じ方。記法の検査には使わず、段の閉じ方の差し戻し（`ReportReview`）が読む。 */
  readonly workPlanClosing: WorkPlanClosing
}

/**
 * 規約違反1つ。`count` は違反の数（文の数・塊の数）で、モデルが書いた文面は持たない
 * （差し戻しの文面に写さないため。会話の中身をモデルの文脈へ戻す経路を作らない）。
 * `code-mismatch` の `paths` は `code` の塊の `path`（schema が決めた識別子で、書いた自由文ではない）。
 */
export type ReportViolation =
  /** `conclusion` が3文以上ある（条1「冒頭の1〜2文で結論」）。 */
  | { readonly kind: "long-conclusion"; readonly count: number }
  /** 4文以上の地の文がある（「地の文の段落は3文まで」）。`count` は `text` の塊と逃げ道の段落の数。 */
  | { readonly kind: "long-paragraph"; readonly count: number }
  /** `mermaid` の塊に、規約が挙げる種類（`REPORT_MERMAID_KINDS`）の外の種類がある。 */
  | { readonly kind: "unknown-mermaid"; readonly count: number }
  /** `note` の塊が3つ以上ある（「1つのレポートに1〜2個まで」）。 */
  | { readonly kind: "too-many-notes"; readonly count: number }
  /**
   * `note` が隣り合う、または見出しのある節の先頭にある。`count` は該当の `note` の数。
   * `tone` が `warn` / `ng` のものは数えない。
   */
  | { readonly kind: "crowded-notes"; readonly count: number }
  /** `fold` を持つ `markdown` の塊が `<details>` を含む、または `<details>` が入れ子になっている。`count` は塊の数。 */
  | { readonly kind: "nested-fold"; readonly count: number }
  /** `options` の候補、`compare` / `beforeAfter` の側の箇条、または `image` の `notes` が上限を超えている塊がある。`count` は塊の数。 */
  | { readonly kind: "too-many-candidates"; readonly count: number }
  /** 候補が採る → 検討 → 採らないの順に並んでいない `options` の塊がある。`count` は塊の数。 */
  | { readonly kind: "unordered-options"; readonly count: number }
  /** 行のセルの数が `columns` と揃わない表がある。`count` は表の数。 */
  | { readonly kind: "ragged-table"; readonly count: number }
  /** `series` の `values` の数が `labels` と揃わない、または `arrow`・`slope` の `series` が2つでない `chart` の塊がある。`count` は塊の数。 */
  | { readonly kind: "ragged-chart"; readonly count: number }
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
  /** `path` を付けた `code` の塊が、そのファイルの中身と一致しない。`paths` は一致しなかった `path`（重複無し）。 */
  | { readonly kind: "code-mismatch"; readonly count: number; readonly paths: readonly string[] }
  /** `mermaid` の塊の構文が割れている。`faults` は位置と字句の名前だけで、図のソースは持たない。 */
  | {
      readonly kind: "broken-mermaid"
      readonly count: number
      readonly faults: readonly MermaidFault[]
    }
  /** `svg` の塊の図形が `width` × `height` の外に出る。`faults` は位置だけで、図形の中身は持たない。 */
  | {
      readonly kind: "broken-svg"
      readonly count: number
      readonly faults: readonly SvgFault[]
    }
  /** `graph` の塊の `source` に読めない行がある。`faults` は位置だけで、書き手の行は持たない。 */
  | {
      readonly kind: "broken-graph"
      readonly count: number
      readonly faults: readonly GraphFault[]
    }
  /** `conclusion` の1文目が全角50字を超える。`count` は1か0、`length` は1文目の字数。 */
  | { readonly kind: "long-first-sentence"; readonly count: number; readonly length: number }
  /** 節の `heading` が30字を超える、または疑問文（末尾が `?`・`？`）。`count` は該当の節の数。 */
  | { readonly kind: "bad-heading"; readonly count: number }
  /** `checks` の `figure` が `数 / 数` の分数に見える。`count` は該当の項目の数。 */
  | { readonly kind: "fraction-figure"; readonly count: number }
  /** `text` の塊か表のセルに ` → ` がある（インラインコードの中は除く）。`count` は該当の塊の数。 */
  | { readonly kind: "arrow-in-prose"; readonly count: number }
  /** `flow` でない `list` で、`label` の無い項目の `text` が「名前: 説明」で始まる。`count` は該当の項目の数。 */
  | { readonly kind: "label-in-item"; readonly count: number }
  /** 項目が3つ以上の `ordered` の `list` で、全部の項目に `label` がある。`count` は該当の塊の数。 */
  | { readonly kind: "labeled-ordered"; readonly count: number }
  /** `text` の塊か節の見出しが、仮名も漢字も無く英語の語が並ぶ地の文になっている。`count` は該当の数。 */
  | { readonly kind: "non-japanese"; readonly count: number }
  /**
   * `figure` の `none` の理由が本文と合わない。
   * `no-shape` なのに `sections` に流れ・つながり・構造を描く塊（`list` の `flow`・`beforeAfter`・`graph`・`mermaid`・`svg`）がある（`count` はその塊の数）か、
   * `short-answer` なのに節が2つ以上か4文以上の地の文の塊がある（`count` はその節の数と塊の数の和）。
   */
  | {
      readonly kind: "figure-contradiction"
      readonly count: number
      readonly reason: "no-shape" | "short-answer"
    }

/** レポートの規約違反を並べる。空なら違反は無い。 */
export function reportViolations(report: ReportDraft): readonly ReportViolation[] {
  const blocks = report.sections.flatMap((section) => section.blocks)
  const notations = notationsInSections(report.sections)
  const mismatchedCodeBlocks = blocks
    .filter(
      (block): block is Extract<ReportBlock, { readonly kind: "code" }> =>
        block.kind === "code" && block.path.trim() !== "",
    )
    .filter((block) => !codeBlockMatchesFile(block, report.fileContents.get(block.path)))
  const firstSentenceLength = [
    ...leadingSentences(report.conclusion, 1)
      .trim()
      .replace(/[。！？]+$/, ""),
  ].length

  const drawnSections = sectionsWithFigure(report.figure, report.sections)
  const drawnBlocks = drawnSections.flatMap((section) => section.blocks)
  const svgFaults = svgFaultsInSections(drawnSections)
  const graphFaults = graphFaultsInSections(drawnSections)

  const counted = [
    { kind: "long-conclusion", count: sentenceCount(report.conclusion) },
    {
      kind: "long-paragraph",
      count:
        blocks.filter(
          (block) => block.kind === "text" && block.fold.trim() === "" && isLongProse(block.text),
        ).length + longMarkdownParagraphCount(blocks),
    },
    { kind: "unknown-mermaid", count: unknownMermaidCount(drawnSections) },
    { kind: "too-many-notes", count: blocks.filter((block) => block.kind === "note").length },
    { kind: "crowded-notes", count: crowdedNoteCount(report.sections) },
    {
      kind: "nested-fold",
      count: blocks.filter(
        (block) =>
          block.kind === "markdown" && hasNestedFold(block.fold, splitFences(block.markdown)),
      ).length,
    },
    {
      kind: "too-many-candidates",
      count: drawnBlocks.filter((block) => hasTooManyCandidates(block)).length,
    },
    {
      kind: "unordered-options",
      count: blocks.filter((block) => block.kind === "options" && !isVerdictOrdered(block)).length,
    },
    { kind: "ragged-table", count: blocks.filter((block) => isRaggedTable(block)).length },
    { kind: "ragged-chart", count: drawnBlocks.filter((block) => isRaggedChart(block)).length },
    {
      kind: "untitled-section",
      count:
        report.sections.length < 2
          ? 0
          : report.sections.filter((section) => section.heading.trim() === "").length,
    },
    { kind: "markdown-notation", count: notations.length, notations },
    {
      kind: "broken-mermaid",
      count: report.mermaidFaults.length,
      faults: report.mermaidFaults,
    },
    { kind: "broken-svg", count: svgFaults.length, faults: svgFaults },
    { kind: "broken-graph", count: graphFaults.length, faults: graphFaults },
    {
      kind: "code-mismatch",
      count: mismatchedCodeBlocks.length,
      paths: [...new Set(mismatchedCodeBlocks.map((block) => block.path))],
    },
    {
      kind: "long-first-sentence",
      count: firstSentenceLength > MAX_FIRST_SENTENCE ? 1 : 0,
      length: firstSentenceLength,
    },
    {
      kind: "bad-heading",
      count: report.sections.filter(({ heading }) => isBadHeading(heading)).length,
    },
    {
      kind: "fraction-figure",
      count: report.checks.filter((check) => FRACTION.test(check.figure)).length,
    },
    {
      kind: "arrow-in-prose",
      count: blocks.filter((block) => proseTexts(block).some(hasArrow)).length,
    },
    {
      kind: "label-in-item",
      count: blocks.reduce((total, block) => total + labelInItemCount(block), 0),
    },
    {
      kind: "labeled-ordered",
      count: blocks.filter((block) => isLabeledOrdered(block)).length,
    },
    {
      kind: "non-japanese",
      count:
        report.sections.filter(({ heading }) => isNonJapanese(heading)).length +
        blocks.filter((block) => block.kind === "text" && isNonJapanese(block.text)).length,
    },
    figureContradiction(report.figure, report.sections),
  ] as const satisfies readonly ReportViolation[]

  return counted.filter((violation) => violation.count > VIOLATION_THRESHOLDS[violation.kind])
}

/**
 * 差し戻すときの `report` の戻り値。
 * 違反した条と直し方だけを1行ずつ並べ、画面の状態（描けたか・どこに出たか）は載せない。モデルの文脈に戻るので短くする。
 */
export function reportRejectionText(violations: readonly ReportViolation[]): string {
  return [
    "レポートの記法の規約に次の違反がある。直して `report` を呼び直すこと:",
    ...violations.map((violation) => `- ${violationLine(violation)}`),
  ].join("\n")
}

/** 違反にしない上限（これを超えたら違反）。 */
const VIOLATION_THRESHOLDS = {
  "long-conclusion": MAX_CONCLUSION_SENTENCES,
  "long-paragraph": 0,
  "unknown-mermaid": 0,
  "too-many-notes": 2,
  "crowded-notes": 0,
  "nested-fold": 0,
  "too-many-candidates": 0,
  "unordered-options": 0,
  "ragged-table": 0,
  "ragged-chart": 0,
  "untitled-section": 0,
  "markdown-notation": 0,
  "broken-mermaid": 0,
  "broken-svg": 0,
  "broken-graph": 0,
  "code-mismatch": 0,
  "long-first-sentence": 0,
  "bad-heading": 0,
  "fraction-figure": 0,
  "arrow-in-prose": 0,
  "label-in-item": 0,
  "labeled-ordered": 0,
  "non-japanese": 0,
  "figure-contradiction": 0,
} as const satisfies Record<ReportViolation["kind"], number>

export const REPORT_VIOLATION_KINDS = keys(VIOLATION_THRESHOLDS)

function violationLine(violation: ReportViolation): string {
  switch (violation.kind) {
    case "long-conclusion":
      return `\`conclusion\` が${violation.count}文ある。2文以内にし、残りは \`sections\` へ移す`
    case "long-paragraph":
      return `4文以上の地の文が${violation.count}個ある。表・箇条書きへ移すか、\`fold\` で畳む`
    case "unknown-mermaid":
      return `mermaid の図に規約の9種の外の種類が${violation.count}個ある。flowchart は graph の塊で書き、それ以外は9種から選ぶ`
    case "too-many-notes":
      return `\`note\` の塊が${violation.count}個ある。2個まで減らす`
    case "crowded-notes":
      return `隣り合う、または見出しの直後にある \`note\` が${violation.count}個ある。間に別の塊を挟むか、\`text\` に直す（\`warn\` / \`ng\` は例外）`
    case "nested-fold":
      return `\`fold\` と \`<details>\` が入れ子になっている塊が${violation.count}個ある。畳むのは1段だけにする`
    case "too-many-candidates":
      return `候補・箇条・説明が${String(MAX_CANDIDATES + 1)}つ以上の \`options\` / \`compare\` / \`beforeAfter\` / \`image\` の \`notes\` が${violation.count}個ある。${String(MAX_CANDIDATES)}つまでに絞る`
    case "unordered-options":
      return `候補が採る → 検討 → 採らないの順に並んでいない \`options\` が${violation.count}個ある。採る候補から順に並べ直す`
    case "ragged-table":
      return `行のセルの数が \`columns\` と揃わない表（\`matrix\` を含む）が${violation.count}個ある。セルの数を揃える`
    case "ragged-chart":
      return `\`series\` の \`values\` の数が \`labels\` と揃わない、または \`arrow\`・\`slope\` の \`series\` が前と後の2つでない \`chart\` の塊が${violation.count}個ある。数を揃える`
    case "untitled-section":
      return `見出しの無い節が${violation.count}個ある。節が2つ以上なら全部に \`heading\` を付ける`
    case "markdown-notation":
      return `\`markdown\` の塊に塊で書ける記法（${violation.notations
        .map((notation) => MARKDOWN_NOTATION_NAMES[notation].written)
        .join("・")}）がある。代わりに${violation.notations
        .map((notation) => MARKDOWN_NOTATION_NAMES[notation].replacement)
        .join("・")}を使う`
    case "code-mismatch":
      return `\`path\` 付きの \`code\` の塊が${violation.count}個、ファイルの中身と一致しない（${violation.paths.join("・")}）。実物を読み直して直すか \`path\` を外す`
    case "broken-mermaid":
      return `mermaid の図の構文が割れている（${mermaidFaultPositions(violation.faults)}）。その行の書き方を直す`
    case "broken-svg":
      return `\`svg\` の図形が \`width\` × \`height\` の外に出ている（${svgFaultPositions(violation.faults)}）。座標か大きさを直す`
    case "broken-graph":
      return `\`graph\` の \`source\` に読めない行がある（${graphFaultPositions(violation.faults)}）。1行を \`A -> B: 語\` の形に直す（\`: 語\` は省ける）`
    case "long-first-sentence":
      return `\`conclusion\` の1文目がいま${String(violation.length)}字で、全角${String(MAX_FIRST_SENTENCE)}字を超える。1文目を短くし、補足は2文目か \`sections\` へ移す`
    case "bad-heading":
      return `見出しが${violation.count}個、${String(MAX_HEADING)}字を超えるか疑問文になっている。その節の結論を言う短い語にする`
    case "fraction-figure":
      return `\`checks\` の \`figure\` に分数（数 / 数）がある項目が${violation.count}個ある。「56 件中 1 件」のように言い換える`
    case "arrow-in-prose":
      return `地の文・表のセルに \`A → B\` と書いた塊が${violation.count}個ある。セルは \`from\` / \`to\`、流れは \`list\` の \`flow\` にする`
    case "label-in-item":
      return `\`list\` の項目の \`text\` が「名前: 説明」の形になっているものが${violation.count}個ある。名前を \`label\` に分ける`
    case "labeled-ordered":
      return `全部の項目に \`label\` がある3段以上の \`ordered\` の \`list\` が${violation.count}個ある。名前の付いた段を辿る流れは \`flow\` にする`
    case "non-japanese":
      return `仮名も漢字も無い英語の地の文・見出しが${violation.count}個ある。日本語で書き直す（識別子・パス・コマンド・コードは \`\` で囲めば英語のままでよい）`
    case "figure-contradiction":
      return violation.reason === "no-shape"
        ? `\`figure\` の reason が \`no-shape\` なのに、\`sections\` に流れ・つながり・構造を描く塊（\`list\` の \`flow\`・\`beforeAfter\`・\`graph\`・\`mermaid\`・\`svg\`）が${violation.count}個ある。その図を \`figure\` に置くか、合う reason にする`
        : `\`figure\` の reason が \`short-answer\` なのに、節が2つ以上あるか4文以上の地の文がある。2〜3文で終わる答えでなければ \`figure\` に図を置くか、合う reason にする`
  }
}

function figureContradiction(
  figure: RecordedReportFigure,
  sections: readonly ReportSection[],
): Extract<ReportViolation, { readonly kind: "figure-contradiction" }> {
  const blocks = sections.flatMap((section) => section.blocks)
  if (figure.kind === "none" && figure.reason === "no-shape") {
    return {
      kind: "figure-contradiction",
      count: blocks.filter((block) => drawsShape(block)).length,
      reason: "no-shape",
    }
  }
  if (figure.kind === "none" && figure.reason === "short-answer") {
    const longProse =
      blocks.filter((block) => block.kind === "text" && isLongProse(block.text)).length +
      longMarkdownParagraphCount(blocks)
    return {
      kind: "figure-contradiction",
      count: (sections.length >= 2 ? sections.length : 0) + longProse,
      reason: "short-answer",
    }
  }
  return { kind: "figure-contradiction", count: 0, reason: "no-shape" }
}

/** 地の文の段落の文の上限（条「地の文の段落は3文まで」）。 */
const MAX_PARAGRAPH_SENTENCES = 3

function isLongProse(text: string): boolean {
  return sentenceCount(text) > MAX_PARAGRAPH_SENTENCES
}

/** 逃げ道の外側の段落のうち、文の上限を超えるものの数。 */
function longMarkdownParagraphCount(blocks: readonly ReportBlock[]): number {
  return blocks
    .flatMap((block) =>
      block.kind === "markdown" ? paragraphs(splitFences(block.markdown).outside) : [],
    )
    .filter(isLongProse).length
}

/** 流れ・つながり・構造を描く塊か（`no-shape` と合わない塊）。 */
function drawsShape(block: ReportBlock): boolean {
  switch (block.kind) {
    case "list":
      return block.style === "flow"
    case "beforeAfter":
    case "graph":
    case "mermaid":
    case "svg":
      return true
    default:
      return false
  }
}

/** 英語の地の文とみなす語の数の下限。 */
const MIN_ENGLISH_WORDS = 3

const KANA_OR_KANJI = /[぀-ヿ㐀-䶿一-鿿]/

/**
 * 仮名も漢字も無く、英語の語が {@link MIN_ENGLISH_WORDS} 以上ある文字か。
 * インラインコード・リンク・URL・パスらしい語（`/` `.` `_` を含む）は数えない。
 */
function isNonJapanese(text: string): boolean {
  const words = text
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[.,;:!?]+$/, ""))
  return (
    !KANA_OR_KANJI.test(words.join(" ")) &&
    words.filter((word) => /^[A-Za-z]{2,}$/.test(word)).length >= MIN_ENGLISH_WORDS
  )
}

const ARROW = " → "

/** 項目の頭の `名前:`。URL の `://` と時刻の `12:30`、句点を含む頭は名前でない。 */
const ITEM_LABEL = new RegExp(`^[^\`:：。\\n]{1,${String(MAX_ITEM_LABEL)}}[:：](?!//)(?!\\d)`)

function withoutInlineCode(text: string): string {
  return text.replace(/`[^`\n]*`/g, "")
}

function hasArrow(text: string): boolean {
  return withoutInlineCode(text).includes(ARROW)
}

function proseTexts(block: ReportBlock): readonly string[] {
  switch (block.kind) {
    case "text":
      return [block.text]
    case "table":
      return block.rows
        .flat()
        .map((cell) => (typeof cell === "string" ? cell : "text" in cell ? cell.text : ""))
    default:
      return []
  }
}

function labelInItemCount(block: ReportBlock): number {
  return block.kind === "list" && block.style !== "flow"
    ? block.items.filter((item) => item.label.trim() === "" && ITEM_LABEL.test(item.text.trim()))
        .length
    : 0
}

const MIN_FLOW_STAGES = 3

function isLabeledOrdered(block: ReportBlock): boolean {
  return (
    block.kind === "list" &&
    block.style === "ordered" &&
    block.items.length >= MIN_FLOW_STAGES &&
    block.items.every((item) => item.label.trim() !== "")
  )
}

/** `数 / 数`（空白は任意）。 */
const FRACTION = /\d\s*\/\s*\d/

function isBadHeading(heading: string): boolean {
  const trimmed = heading.trim()
  return [...trimmed].length > MAX_HEADING || /[?？]$/.test(trimmed)
}

/** `options` の候補を書く順。 */
const VERDICT_ORDER = {
  adopt: 0,
  consider: 1,
  reject: 2,
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "options" }>["items"][number]["verdict"],
  number
>

function crowdedNoteCount(sections: readonly ReportSection[]): number {
  return sections.reduce(
    (total, section) =>
      total +
      section.blocks.filter(
        (block, index) =>
          block.kind === "note" &&
          block.tone !== "warn" &&
          block.tone !== "ng" &&
          (section.blocks[index - 1]?.kind === "note" ||
            (index === 0 && section.heading.trim() !== "")),
      ).length,
    0,
  )
}

function hasTooManyCandidates(block: ReportBlock): boolean {
  switch (block.kind) {
    case "options":
      return block.items.length > MAX_CANDIDATES
    case "compare":
      return block.sides.some((side) => side.points.length > MAX_CANDIDATES)
    case "beforeAfter":
      return [block.before, block.after].some(
        (side) => side.kind === "points" && side.points.length > MAX_CANDIDATES,
      )
    case "image":
      return block.notes.length > MAX_CANDIDATES
    default:
      return false
  }
}

/** 行のセルの数が列の数と揃わない表か。 */
function isVerdictOrdered(block: Extract<ReportBlock, { readonly kind: "options" }>): boolean {
  const ranks = block.items.map((item) => VERDICT_ORDER[item.verdict])
  return ranks.every((rank, index) => index === 0 || (ranks[index - 1] ?? rank) <= rank)
}

function isRaggedTable(block: ReportBlock): boolean {
  switch (block.kind) {
    case "table":
      return block.rows.some((row) => row.length !== block.columns.length)
    case "matrix":
      return block.rows.some(({ cells }) => cells.length !== block.columns.length)
    default:
      return false
  }
}

/** 系列の値の数が labels の数と揃わない、または arrow・slope の系列が前と後の2つでない chart の塊か。 */
function isRaggedChart(block: ReportBlock): boolean {
  return (
    block.kind === "chart" &&
    (block.series.some((series) => series.values.length !== block.labels.length) ||
      ((block.chartKind === "arrow" || block.chartKind === "slope") && block.series.length !== 2))
  )
}
