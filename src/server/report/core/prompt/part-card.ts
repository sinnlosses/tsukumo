// `report` の部品1種類の文法カード（JSON Schema と `components` の例1つ）。
// 型は `report` の定義と同じ部品の zod から出し、説明を手で写さない。

import { omit } from "remeda"
import { z } from "zod"

import { REPORT_COMPONENT_SCHEMAS } from "../../../../shared/report/a2ui-report-catalog.ts"
import { PART_EXAMPLES } from "../../../../shared/report/part-example-list.ts"

/** `report_part_card` ツールの説明文。 */
export const PART_CARD_TOOL_DESCRIPTION =
  "report の components に置く部品の JSON Schema と、components の例1つを、部品の名前を渡して引く。" +
  "JSON Schema は report の定義の部品と同じ。部品の書き方に迷ったときに、使う前に引く"

/** `report_part_card` の `component` の欄の説明。 */
export const PART_CARD_COMPONENT_DESCRIPTION =
  "部品の名前（component の値。例: Table・Graph・Chart）。知らない名前には引ける名前の一覧を返す"

/** 部品の名前を渡して引いた結果。知らない名前なら、引ける名前の一覧を言う文。 */
type PartCard =
  | { readonly kind: "card"; readonly text: string }
  | { readonly kind: "unknown-component"; readonly text: string }

export function partCardOf(component: string): PartCard {
  if (!isComponentName(component)) {
    return {
      kind: "unknown-component",
      text: `知らない部品の名前: ${JSON.stringify(component)}。引ける名前: ${COMPONENT_NAMES.join(", ")}`,
    }
  }
  return {
    kind: "card",
    text: [
      `部品 ${component} の文法（report の定義の部品と同じ JSON Schema）`,
      "JSON Schema:",
      JSON.stringify(
        omit(z.toJSONSchema(REPORT_COMPONENT_SCHEMAS[component], { io: "input" }), ["$schema"]),
      ),
      "例（components の要素。id は例の中で閉じている）:",
      JSON.stringify(PART_EXAMPLES[component]),
      ...expressionExampleLines(component),
    ].join("\n"),
  }
}

const EXPRESSION_EXAMPLE_HEADING =
  "式を結ぶ例（つまみの name と defs の名前を式で読む。format の ${…} には名前か短い式だけを書き、文字のリテラルは書かない）:"

function expressionExampleLines(component: string): readonly string[] {
  const example = EXPRESSION_EXAMPLES.get(component)
  return example === undefined ? [] : [EXPRESSION_EXAMPLE_HEADING, JSON.stringify(example)]
}

const expr = (source: string) => ({ call: "expr", args: { source } })
const format = (template: string) => ({ call: "format", args: { template } })

const WORKER_SLIDER = {
  id: "w1",
  component: "ParameterSlider",
  name: "w",
  label: "worker 数",
  min: 1,
  max: 8,
  step: 1,
  initial: 4,
}

const WORKER_DEFS = { ws: "range(1, 8)", times: "240 / ws + 6 * ws", cur: "240 / w + 6 * w" }

function reportRoot(defs: Record<string, string>) {
  return { id: "root", component: "Report", children: ["s1"], defs }
}

/** 式を結べる部品とつまみの部品の例。題材は worker 数と所要で、例の値はすべて架空。 */
const EXPRESSION_EXAMPLES: ReadonlyMap<string, readonly unknown[]> = new Map([
  [
    "ParameterSlider",
    [
      reportRoot(WORKER_DEFS),
      { id: "s1", component: "Section", heading: "worker 数", children: ["w1", "p1"] },
      WORKER_SLIDER,
      { id: "p1", component: "Paragraph", text: format("w = ${w} のとき所要は ${cur} 秒。") },
    ],
  ],
  [
    "ParameterCheckBox",
    [
      reportRoot({ base: "240 + (e2e ? 120 : 0)", note: 'e2e ? "E2E を含む" : "単体のみ"' }),
      { id: "s1", component: "Section", heading: "検査の範囲", children: ["c1", "p1"] },
      {
        id: "c1",
        component: "ParameterCheckBox",
        name: "e2e",
        label: "E2E を含める",
        initial: false,
      },
      { id: "p1", component: "Paragraph", text: format("${note} の直列の所要は ${base} 秒。") },
    ],
  ],
  [
    "Paragraph",
    [
      reportRoot(WORKER_DEFS),
      { id: "s1", component: "Section", heading: "所要", children: ["w1", "p1"] },
      WORKER_SLIDER,
      { id: "p1", component: "Paragraph", text: format("いまの所要は ${cur} 秒。") },
    ],
  ],
  [
    "Stats",
    [
      reportRoot(WORKER_DEFS),
      { id: "s1", component: "Section", heading: "所要", children: ["w1", "st1"] },
      WORKER_SLIDER,
      {
        id: "st1",
        component: "Stats",
        items: [{ label: "所要（秒）", before: "240", value: expr("cur"), better: "down" }],
      },
    ],
  ],
  [
    "Chart",
    [
      reportRoot(WORKER_DEFS),
      { id: "s1", component: "Section", heading: "所要", children: ["w1", "ch1"] },
      WORKER_SLIDER,
      {
        id: "ch1",
        component: "Chart",
        chartKind: "line",
        title: format("w = ${w} のときの worker 数ごとの所要（秒）"),
        labels: expr('text(ws, "本")'),
        series: [{ name: "所要（秒）", values: expr("times") }],
      },
    ],
  ],
])

const COMPONENT_NAMES = Object.keys(REPORT_COMPONENT_SCHEMAS)

function isComponentName(name: string): name is keyof typeof REPORT_COMPONENT_SCHEMAS {
  return Object.hasOwn(REPORT_COMPONENT_SCHEMAS, name)
}
