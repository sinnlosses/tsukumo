// 書く前の手引き（材料の形の宣言と部品の引き方の目安）が部品の選びを変えるかを測る、条件・依頼の文・集計。
// 外のプロセスを起こさない純粋な部品だけを持つ。

import { isPlainObject, sumBy, unique } from "remeda"

import { REPORT_PART_CHOICE_GUIDE } from "../../../src/server/report/core/prompt/report-notation.ts"
import { NEUTRAL_TOPICS, type TopicId } from "./a2ui-trial-topic.ts"

/**
 * 書く前の手引き。`declare` は材料の形を先に書かせるだけ、`decide` は材料の形から部品を引く目安も依頼文に添える。
 * `shipped` は記法の条の文面を、本番と同じ system prompt の末尾に足す。
 */
export type Guide = "none" | "declare" | "decide" | "shipped"

const DECLARATION_PREFIX = "DECLARE"

const DECLARE_CLAUSE = [
  `書き始める前に、次の 2 行を先に出力する。各行は ${DECLARATION_PREFIX} で始め、角括弧は使わない。そのあとで JSON の配列を出力する。`,
  `${DECLARATION_PREFIX} 読み手が決めること: <1 文>`,
  `${DECLARATION_PREFIX} 材料の形: <件数・型（名前・順序・時間・量）・関係（比べる・順位・内訳・推移・手順）を 1 文>`,
].join("\n")

const LAYOUT_COMPONENTS: readonly string[] = ["Row", "Column", "Card", "Tabs"]

// 使われ方の記録の集計の「図の部品」（Graph・Chart・Picture・Compare）に、図に当たる未使用の部品を足した
const FIGURE_COMPONENTS: readonly string[] = [
  "Graph",
  "Chart",
  "Picture",
  "Compare",
  "Stats",
  "Timeline",
  "Plot",
  "Mermaid",
  "Svg",
]

export type ChoiceCondition = {
  readonly id: string
  readonly loading: "full"
  readonly topic: TopicId
  readonly sections: number
  readonly withExample: boolean
  readonly guide: Guide
}

export type ChoiceResult = {
  readonly guide: Guide
  readonly firstFaults: readonly unknown[]
  readonly componentNames: readonly string[]
  // 最初の出力の字数。生の出力が残っていない結果は undefined
  readonly firstChars?: number
}

export type ChoiceRow = {
  readonly guide: Guide
  readonly count: number
  readonly readable: number
  readonly firstPass: number
  readonly table: number
  readonly layout: number
  readonly figure: number
  // 1 件あたりの部品の種類の平均（Report・Section を含む）
  readonly kinds: number
  // 最初の出力の平均字数。字数の分かる結果が無ければ 0
  readonly chars: number
}

/** 部品の選びを測る条件。形を指定しない題材を、手引きの 4 通りで書かせる（載せ方は全部載せ、例つき、節は 3）。 */
export function choiceTrialConditions(): readonly ChoiceCondition[] {
  const guides: readonly Guide[] = ["none", "declare", "decide", "shipped"]
  return NEUTRAL_TOPICS.flatMap((topic) =>
    guides.flatMap((guide) =>
      [1, 2].map((repeat): ChoiceCondition => ({
        id: `K-${topic}-${guide}${repeat === 1 ? "" : `-r${String(repeat)}`}`,
        loading: "full",
        topic,
        sections: 3,
        withExample: true,
        guide,
      })),
    ),
  )
}

/** 依頼文の後ろに足す手引き。`none` と `shipped` は何も足さない。 */
export function guideClause(guide: Guide): string {
  switch (guide) {
    case "none":
    case "shipped":
      return ""
    case "declare":
      return `\n\n${DECLARE_CLAUSE}`
    case "decide":
      return `\n\n${DECLARE_CLAUSE}\n\n${REPORT_PART_CHOICE_GUIDE}`
  }
}

/** system prompt の末尾に足す手引き。`shipped` だけが、記法の条の文面を足す。 */
export function guideSystemClause(guide: Guide): string {
  return guide === "shipped" ? `\n\n${REPORT_PART_CHOICE_GUIDE}` : ""
}

/** 書き手の返答から、書く前の宣言の行（`DECLARE` で始まる行）を除く。 */
export function stripDeclaration(reply: string): string {
  return reply
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(DECLARATION_PREFIX))
    .join("\n")
}

/** 出力の部品の一覧に現れた部品の名前（重複無し）。 */
export function usedComponentNames(components: readonly unknown[]): readonly string[] {
  const names = components.flatMap((component) =>
    isPlainObject(component) && typeof component["component"] === "string"
      ? [component["component"]]
      : [],
  )
  return unique(names)
}

/** 手引きごとの、部品の選びの集計の行。部品を使った件数は、出力が配列として読めた件数のうち、その部品を 1 つでも使ったもの。 */
export function summarizeChoice(results: readonly ChoiceResult[]): readonly ChoiceRow[] {
  const groups = Map.groupBy(results, (result) => result.guide)
  return [...groups.entries()].toSorted().map(([guide, rows]) => {
    const readable = rows.filter((row) => row.componentNames.length > 0)
    const using = (names: readonly string[]): number =>
      readable.filter((row) => row.componentNames.some((name) => names.includes(name))).length
    return {
      guide,
      count: rows.length,
      readable: readable.length,
      firstPass: rows.filter((row) => row.firstFaults.length === 0).length,
      table: using(["Table"]),
      layout: using(LAYOUT_COMPONENTS),
      figure: using(FIGURE_COMPONENTS),
      kinds: average(readable.map((row) => row.componentNames.length)),
      chars: Math.round(average(rows.flatMap((row) => row.firstChars ?? []))),
    }
  })
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }
  return Math.round((sumBy(values, (value) => value) / values.length) * 10) / 10
}
