// `report` の `a2ui` の変種を AI に書かせる測定の、条件・依頼の文・判定・集計。
// 外のプロセスを起こさない純粋な部分だけを持つ。

import { z } from "zod"

import { REPORT_TOOL_NAME } from "../../../src/server/core/tsukumo-tool-name.ts"
import { a2uiStructureFaults } from "../../../src/server/report/core/a2ui-structure-fault.ts"
import { PART_CARD_TOOL_DESCRIPTION } from "../../../src/server/report/core/part-card.ts"
import { a2uiValidationFailedText } from "../../../src/server/report/core/report-rejection.ts"
import { REPORT_A2UI_COMPONENTS_DESCRIPTION } from "../../../src/server/report/core/report-tool.ts"
import {
  a2uiReportComponentSchema,
  buildReportCatalogDocument,
  REPORT_COMPONENT_SCHEMAS,
} from "../../../src/shared/report/a2ui-report-catalog.ts"
import {
  CONTROL_TOPICS,
  FAULT_TOPICS,
  isControlTopic,
  isFaultTopic,
  PLAIN_TOPICS,
  type TopicId,
} from "./a2ui-trial-topic.ts"

export type Loading = "full" | "names"

export type TrialCondition = {
  readonly id: string
  readonly loading: Loading
  readonly topic: TopicId
  readonly sections: number
  readonly withExample: boolean
}

/** 判定で落ちた理由 1 つ。`source` は SDK の入力検査に当たる層（schema）か構造の検査（structure）。 */
export type Fault = { readonly source: "schema" | "structure"; readonly code: string }

export type Judgement = {
  readonly faults: readonly Fault[]
  readonly retryText: string
  readonly sectionCount: number
  readonly usedControls: boolean
}

export type CaseResult = {
  readonly id: string
  readonly loading: Loading
  readonly topic: TopicId
  readonly sections: number
  readonly firstFaults: readonly Fault[]
  readonly firstSectionCount: number
  readonly retryFaults: readonly Fault[] | undefined
  readonly usedControls: boolean
  readonly calls: number
  // 最初の出力と再試行の出力の字数。出力が残っていない結果や再試行しなかった結果は undefined
  readonly firstChars: number | undefined
  readonly retryChars: number | undefined
}

type Outcome = "first-pass" | "fixed" | "unfixed"

const COMPONENT_PURPOSES = {
  Report: "根。結論・検証結果・締めのセリフなど報告全体の欄を持つ。id は root",
  Section: "節。見出しと、葉か配置の部品の id の並び",
  Paragraph: "地の文",
  ItemList: "箇条書き",
  Table: "表。並べ替え・絞り込みの欄を持てる",
  Matrix: "行と列の対応表",
  Compare: "案の比較",
  BeforeAfter: "前後の対",
  Note: "注記の枠",
  Stats: "数の札",
  Code: "コードの断片",
  Mermaid: "sequenceDiagram か stateDiagram-v2 の図",
  Graph: "矢印でつないだ図",
  Chart: "棒などの図",
  Svg: "図形の図",
  Timeline: "時間の流れ",
  Options: "候補の並び",
  Claims: "確度つきの主張の並び",
  Picture: "手元の画像",
  Plot: "散布図などの統計の図",
  Markdown: "Markdown の本文",
  Row: "子を横に並べる配置",
  Column: "子を縦に並べる配置",
  Card: "子を 1 つ枠に入れる配置",
  Tabs: "子を切り替えて見せる配置",
  ChoicePicker: "選択肢。Table の絞り込みと path で結ぶ",
} as const satisfies Record<keyof typeof REPORT_COMPONENT_SCHEMAS, string>

export function trialConditions(): readonly TrialCondition[] {
  const loadings: readonly Loading[] = ["full", "names"]
  return loadings.flatMap((loading) => [
    ...PLAIN_TOPICS.flatMap((topic) =>
      [2, 3, 4].flatMap((sections) =>
        [false, true].map((withExample) => condition(loading, topic, sections, withExample)),
      ),
    ),
    ...CONTROL_TOPICS.flatMap((topic) =>
      [2, 3].map((sections) => condition(loading, topic, sections, true)),
    ),
    ...FAULT_TOPICS.flatMap((topic) =>
      (loading === "full" ? [2, 3] : [2, 3, 4]).map((sections) =>
        condition(loading, topic, sections, true),
      ),
    ),
  ])
}

/** 書き手に渡す system prompt。`names` は部品名の一覧だけで、型は `CARD <部品名>` で引かせる。 */
export function systemPromptFor(loading: Loading, example: readonly unknown[] | undefined): string {
  const rules = [
    "あなたは報告を A2UI の部品の平らな一覧で出力する。出力は JSON の配列 1 つだけにする（説明文・コードフェンスは付けない）。",
    `配列は ${REPORT_TOOL_NAME} ツールの components 引数にそのまま渡される。${REPORT_A2UI_COMPONENTS_DESCRIPTION}`,
    "規則: 根は id が root の Report。Report.children には Section の id だけを置く。Section の子に Section は置けない。配置の部品（Row・Column・Card・Tabs）の入れ子は 3 階層まで。参照されない部品・同じ id・参照先の無い id は置けない。",
  ]
  const catalog =
    loading === "full"
      ? [
          "使える部品は次のカタログに定義されたものだけ。",
          JSON.stringify(buildReportCatalogDocument()),
        ]
      : [
          "使える部品の名前は次のとおり。型が要る部品は、先に `CARD <部品名>` だけを 1 行ずつ出力する（そのときは JSON の配列を出さない）。引いた型と例が届いたら、そのあと JSON の配列を出力する。",
          namesListText(),
        ]
  const exampleText =
    example === undefined
      ? []
      : ["出力の例（節の数と中身は依頼に合わせて変える）:", JSON.stringify(example)]
  return [...rules, ...catalog, ...exampleText].join("\n\n")
}

/** 書き手の返答から、`CARD <部品名>` の行で引かれた部品名を取る。 */
export function requestedCards(reply: string): readonly string[] {
  const names = reply
    .split("\n")
    .flatMap((line) => {
      const matched = /^CARD\s+([A-Za-z]+)\s*$/.exec(line.trim())
      return matched?.[1] === undefined ? [] : [matched[1]]
    })
    .filter((name) => name in REPORT_COMPONENT_SCHEMAS)
  return [...new Set(names)]
}

/**
 * 部品 1 つの文法カード（`report_part_card` の代役）。JSON Schema の断片と、断片が参照する `$defs`、例。
 * 断片から再帰で辿った `#/$defs/` の参照先が `$defs` に無ければ投げる。
 */
export function catalogCard(
  name: string,
  document: CatalogDocument,
  example: unknown,
): { readonly text: string; readonly definitions: readonly string[] } {
  const fragment = document.components[name]
  if (fragment === undefined) {
    throw new Error(`カタログに無い部品: ${name}`)
  }
  const definitions = referencedDefinitions(fragment, document.$defs)
  const card = {
    component: name,
    schema: fragment,
    $defs: Object.fromEntries(definitions.map((def) => [def, document.$defs[def]])),
    ...(example === undefined ? {} : { example }),
  }
  return { text: JSON.stringify(card), definitions }
}

export type CatalogDocument = {
  readonly $defs: Readonly<Record<string, unknown>>
  readonly components: Readonly<Record<string, unknown>>
}

/** 出力から JSON の配列を取り出す。コードフェンスや前後の説明は読み飛ばす。無ければ undefined。 */
export function extractComponents(text: string): readonly unknown[] | undefined {
  const start = text.indexOf("[")
  const end = text.lastIndexOf("]")
  if (start < 0 || end <= start) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** 本番の `report` の検査と同じ順で判定する。入力検査（部品ごとの形）が先で、通ったら構造の検査。 */
export function judgeComponents(components: readonly unknown[] | undefined): Judgement {
  if (components === undefined) {
    return {
      faults: [{ source: "schema", code: "not-a-json-array" }],
      retryText: `Input validation error: Invalid arguments for tool ${REPORT_TOOL_NAME}: components が JSON の配列になっていない`,
      sectionCount: 0,
      usedControls: false,
    }
  }
  const sectionCount = components.filter(
    (component) => isRecord(component) && component["component"] === "Section",
  ).length
  const usedControls = components.some(usesControl)
  const issues = components.flatMap((component, index) => {
    const parsed = a2uiReportComponentSchema.safeParse(component)
    return parsed.success
      ? []
      : parsed.error.issues.map((issue) => ({
          ...issue,
          path: ["components", index, ...issue.path],
        }))
  })
  if (issues.length > 0) {
    return {
      faults: issues.map((issue) => ({ source: "schema", code: schemaCodeOf(issue) })),
      retryText: `Input validation error: Invalid arguments for tool ${REPORT_TOOL_NAME}: ${JSON.stringify(issues)}`,
      sectionCount,
      usedControls,
    }
  }
  const structure = a2uiStructureFaults(components)
  return {
    faults: structure.map((fault) => ({ source: "structure", code: fault.kind })),
    retryText: structure.length === 0 ? "" : a2uiValidationFailedText(structure),
    sectionCount,
    usedControls,
  }
}

/** `components` 引数の定義の字数。`full` は a2uiInputShape と同じ形の JSON Schema 全部、`names` は名前の列挙と引く口。 */
export function toolDefinitionChars(loading: Loading): {
  readonly total: number
  readonly cardAverage: number
  readonly cardMax: number
} {
  const document = buildReportCatalogDocument()
  const cards = Object.keys(REPORT_COMPONENT_SCHEMAS).map(
    (name) => catalogCard(name, document, undefined).text.length,
  )
  const cardAverage = Math.round(cards.reduce((sum, size) => sum + size, 0) / cards.length)
  const cardMax = Math.max(...cards)
  if (loading === "full") {
    const schema = z.toJSONSchema(z.array(a2uiReportComponentSchema), { io: "input" })
    return {
      total: JSON.stringify(schema).length + REPORT_A2UI_COMPONENTS_DESCRIPTION.length,
      cardAverage,
      cardMax,
    }
  }
  return {
    total:
      namesListText().length +
      REPORT_A2UI_COMPONENTS_DESCRIPTION.length +
      PART_CARD_TOOL_DESCRIPTION.length,
    cardAverage,
    cardMax,
  }
}

/** 載せ方 × 操作の有無ごとの集計の行。 */
export function summarizeCases(results: readonly CaseResult[]): readonly SummaryRow[] {
  const groups = Map.groupBy(
    results,
    (result) => `${result.loading}\t${groupLabelOf(result.topic)}`,
  )
  return [...groups.entries()].toSorted().map(([key, rows]) => {
    const [loading = "", controls = ""] = key.split("\t")
    const outcomes = rows.map(outcomeOf)
    const retried = rows.filter((row) => row.retryFaults !== undefined)
    const measured = retried.filter(
      (row) => row.firstChars !== undefined && row.retryChars !== undefined,
    )
    const faultCodes = rows.flatMap((row) =>
      row.firstFaults.map((fault) => `${fault.source}:${fault.code}`),
    )
    return {
      loading,
      controls,
      count: rows.length,
      firstPass: outcomes.filter((outcome) => outcome === "first-pass").length,
      fixed: outcomes.filter((outcome) => outcome === "fixed").length,
      unfixed: outcomes.filter((outcome) => outcome === "unfixed").length,
      sectionMatch: rows.filter((row) => row.firstSectionCount === row.sections).length,
      pathFaults: faultCodes.filter((code) => code.startsWith("structure:filter-")).length,
      usedControls: rows.filter((row) => row.usedControls).length,
      calls: rows.reduce((sum, row) => sum + row.calls, 0),
      retried: retried.length,
      retryCalls: retried.length,
      firstCharsAverage: average(measured.map((row) => row.firstChars)),
      retryCharsAverage: average(measured.map((row) => row.retryChars)),
      reasons: tally(faultCodes),
    }
  })
}

function average(sizes: readonly (number | undefined)[]): number | undefined {
  const known = sizes.filter((size) => size !== undefined)
  return known.length === 0
    ? undefined
    : Math.round(known.reduce((sum, size) => sum + size, 0) / known.length)
}

export type SummaryRow = {
  readonly loading: string
  readonly controls: string
  readonly count: number
  readonly firstPass: number
  readonly fixed: number
  readonly unfixed: number
  readonly sectionMatch: number
  readonly pathFaults: number
  readonly usedControls: number
  readonly calls: number
  readonly retried: number
  readonly retryCalls: number
  readonly firstCharsAverage: number | undefined
  readonly retryCharsAverage: number | undefined
  readonly reasons: string
}

function groupLabelOf(topic: TopicId): string {
  if (isFaultTopic(topic)) {
    return "違反を促す"
  }
  return isControlTopic(topic) ? "操作あり" : "操作無し"
}

/** 一発・直った・直らない。再試行しなかった（一発で通った）ときは `retryFaults` が undefined。 */
function outcomeOf(result: CaseResult): Outcome {
  if (result.firstFaults.length === 0) {
    return "first-pass"
  }
  return result.retryFaults?.length === 0 ? "fixed" : "unfixed"
}

function condition(
  loading: Loading,
  topic: TopicId,
  sections: number,
  withExample: boolean,
): TrialCondition {
  return {
    id: `${loading === "full" ? "A" : "B"}-${topic}-n${String(sections)}-${withExample ? "ex" : "noex"}`,
    loading,
    topic,
    sections,
    withExample,
  }
}

function namesListText(): string {
  return Object.entries(COMPONENT_PURPOSES)
    .map(([name, purpose]) => `- ${name}: ${purpose}`)
    .join("\n")
}

function referencedDefinitions(
  fragment: unknown,
  definitions: Readonly<Record<string, unknown>>,
): readonly string[] {
  const found = new Set<string>()
  const visit = (node: unknown): void => {
    for (const reference of localReferences(node)) {
      if (found.has(reference)) {
        continue
      }
      if (!(reference in definitions)) {
        throw new Error(`$defs に無い参照: ${reference}`)
      }
      found.add(reference)
      visit(definitions[reference])
    }
  }
  visit(fragment)
  return [...found]
}

function localReferences(node: unknown): readonly string[] {
  if (Array.isArray(node)) {
    return node.flatMap(localReferences)
  }
  if (!isRecord(node)) {
    return []
  }
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === "$ref" && typeof value === "string" && value.startsWith("#/$defs/")) {
      return [value.slice("#/$defs/".length)]
    }
    return localReferences(value)
  })
}

function usesControl(component: unknown): boolean {
  if (!isRecord(component)) {
    return false
  }
  return (
    component["component"] === "ChoicePicker" ||
    component["sortable"] === true ||
    component["filterable"] === true
  )
}

function schemaCodeOf(issue: z.core.$ZodIssue): string {
  return issue.code === "invalid_union"
    ? "invalid_union"
    : `${issue.code}:${issue.path.slice(2).join(".")}`
}

function tally(codes: readonly string[]): string {
  const counts = Map.groupBy(codes, (code) => code)
  return (
    [...counts.entries()]
      .toSorted((left, right) => right[1].length - left[1].length)
      .map(([code, rows]) => `${code} ${String(rows.length)}`)
      .join(", ") || "なし"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
