// 文章の検査の家族。違反の型・検出・差し戻し文を持つ。

import { MAX_FIRST_SENTENCE, MAX_HEADING } from "../../../../shared/report/report-limit.ts"
import { type ReportOutline, sectionLeaves } from "../../../../shared/report/report-outline.ts"
import type { ReportDraft } from "./draft.ts"
import { PLAIN_WORDS } from "./plain-word.ts"
import { brokenInlineMarks } from "./prose/inline-mark.ts"
import {
  MARKDOWN_NOTATION_NAMES,
  type MarkdownNotation,
  notationsInSections,
} from "./prose/notation.ts"
import { plainWordSpellingsIn } from "./prose/plain-word-find.ts"
import {
  hasArrow,
  isBadHeading,
  isLabeledOrdered,
  isNonJapanese,
  labelInItemCount,
  proseTexts,
} from "./prose/sentence.ts"

export type ProseViolation =
  /** `conclusion` が3要素以上ある（「結論は `conclusion` に1〜2文で書く」）。 */
  | { readonly kind: "long-conclusion"; readonly count: number }
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
  /** `conclusion` の1要素目が全角50字を超える。`count` は1か0、`length` は1要素目の字数。 */
  | { readonly kind: "long-first-sentence"; readonly count: number; readonly length: number }
  /** 節の `heading` が30字を超える、または疑問文（末尾が `?`・`？`）。`count` は該当の節の数。 */
  | { readonly kind: "bad-heading"; readonly count: number }
  /** `text` の塊か表のセルに ` → ` がある（インラインコードの中は除く）。`count` は該当の塊の数。 */
  | { readonly kind: "arrow-in-prose"; readonly count: number }
  /** `flow` でない `list` で、`label` の無い項目の `text` が「名前: 説明」で始まる。`count` は該当の項目の数。 */
  | { readonly kind: "label-in-item"; readonly count: number }
  /** 項目が3つ以上の `ordered` の `list` で、全部の項目に `label` がある。`count` は該当の塊の数。 */
  | { readonly kind: "labeled-ordered"; readonly count: number }
  /** `text` の塊が、仮名も漢字も無く英語の語が並ぶ地の文になっている。`count` は該当の数。 */
  | { readonly kind: "non-japanese"; readonly count: number }
  /** 地の文に、言い換え表（`PLAIN_WORDS`）の語がある。`spellings` は見つけた表の綴りで、書いた文面は持たない。 */
  | {
      readonly kind: "plain-word"
      readonly count: number
      readonly spellings: readonly string[]
    }
  /**
   * 結論・`text` の塊・`list` の項目・`table` のセルに、行内の印の書式に当たらない `{{` がある。
   * `count` はその `{{` の数で、本文の字は持たない。
   */
  | { readonly kind: "broken-inline-mark"; readonly count: number }

/** 文章の違反を、当てはまらないもの（`count` が 0）も含めて並べる。 */
export function detectProseViolations(
  report: ReportDraft,
  outline: ReportOutline,
): readonly ProseViolation[] {
  const leaves = sectionLeaves(outline)
  const notations = notationsInSections(outline)
  const firstSentenceLength = report.conclusionSentenceChars[0] ?? 0
  const plainWords = plainWordSpellingsIn(report, outline)

  return [
    { kind: "long-conclusion", count: report.conclusionSentenceChars.length },
    {
      kind: "untitled-section",
      count:
        outline.sections.length < 2
          ? 0
          : outline.sections.filter(
              (section) => section.kind === "loose" || section.heading.trim() === "",
            ).length,
    },
    { kind: "markdown-notation", count: notations.length, notations },
    {
      kind: "long-first-sentence",
      count: firstSentenceLength > MAX_FIRST_SENTENCE ? 1 : 0,
      length: firstSentenceLength,
    },
    {
      kind: "bad-heading",
      count: outline.sections.filter(
        (section) => section.kind === "section" && isBadHeading(section.heading),
      ).length,
    },
    {
      kind: "arrow-in-prose",
      count: leaves.filter((leaf) => proseTexts(leaf).some(hasArrow)).length,
    },
    {
      kind: "label-in-item",
      count: leaves.reduce((total, leaf) => total + labelInItemCount(leaf), 0),
    },
    {
      kind: "labeled-ordered",
      count: leaves.filter((leaf) => isLabeledOrdered(leaf)).length,
    },
    {
      kind: "non-japanese",
      count: leaves.filter((leaf) => leaf.component === "Paragraph" && isNonJapanese(leaf.text))
        .length,
    },
    { kind: "plain-word", count: plainWords.length, spellings: plainWords },
    { kind: "broken-inline-mark", count: brokenInlineMarks(report, outline) },
  ]
}

/** 文章の違反を、差し戻すときの1行の文面にする。 */
export function proseViolationMessage(violation: ProseViolation): string {
  switch (violation.kind) {
    case "long-conclusion":
      return `\`conclusion\` が${violation.count}要素ある。1要素1文で2要素以内にし、残りは \`Section\` へ移す`
    case "untitled-section":
      return `見出しの無いセクションが${violation.count}個ある。セクションが2つ以上なら全部に \`heading\` を付ける`
    case "markdown-notation":
      return `\`Markdown\` に部品で書ける記法（${violation.notations
        .map((notation) => MARKDOWN_NOTATION_NAMES[notation].written)
        .join("・")}）がある。代わりに${violation.notations
        .map((notation) => MARKDOWN_NOTATION_NAMES[notation].replacement)
        .join("・")}を使う`
    case "long-first-sentence":
      return `\`conclusion\` の1要素目がいま${String(violation.length)}字で、全角${String(MAX_FIRST_SENTENCE)}字を超える。1要素目を短くし、補足は2要素目か \`Section\` へ移す`
    case "bad-heading":
      return `見出しが${violation.count}個、${String(MAX_HEADING)}字を超えるか疑問文になっている。そのセクションの結論を言う短い語にする`
    case "arrow-in-prose":
      return `地の文・表のセルに \`A → B\` と書いた部品が${violation.count}個ある。セルは \`from\` / \`to\`、流れは \`ItemList\` の \`flow\` にする`
    case "label-in-item":
      return `\`ItemList\` の項目の \`text\` が「名前: 説明」の形になっているものが${violation.count}個ある。名前を \`label\` に分ける（名前と値だけの並びは \`DescriptionList\`）`
    case "labeled-ordered":
      return `全部の項目に \`label\` がある3段以上の \`ordered\` の \`ItemList\` が${violation.count}個ある。名前の付いた段を辿る流れは \`flow\` にする`
    case "non-japanese":
      return `仮名も漢字も無い英語の地の文が${violation.count}個ある。日本語で書き直す（識別子・パス・コマンド・コードは \`\` で囲めば英語のままでよい）`
    case "plain-word":
      return `地の文にわかりにくい語がある。${plainWordReplacements(violation.spellings)}。言い換えて書き直す（コード・引用の中は対象外）`
    case "broken-inline-mark":
      return `行内の印の書式（\`{{A → B}}\`・\`{{spark: 数 数 …}}\`・\`{{a / b}}\`）に当たらない \`{{\` が${violation.count}個ある。書式に合わせて直すか、\`{{\` を使わない書き方にする`
  }
}

/** 見つけた綴りごとに「綴り → 言い換え先」を並べる。表から取った語だけで、書かれた文面は写さない。 */
export function plainWordReplacements(spellings: readonly string[]): string {
  return spellings
    .map((spelling) => {
      const word = PLAIN_WORDS.find((entry) => entry.spelling === spelling)
      return word === undefined ? spelling : `「${spelling}」は「${word.replacement}」`
    })
    .join("・")
}
