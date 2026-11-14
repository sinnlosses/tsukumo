// `report` の部品1種類の文法カード（JSON Schema と `components` の例1つ）。
// 型は `report` の定義と同じ部品の zod から出し、説明を手で写さない。

import { omit } from "remeda"
import { z } from "zod"

import { REPORT_COMPONENT_SCHEMAS } from "../../../../shared/report/a2ui-report-catalog.ts"
import { PART_CARD_NOTES, partCardNote } from "../../../../shared/report/part-card-note.ts"
import { PART_EXAMPLES } from "../../../../shared/report/part-example-list.ts"
import {
  REPORT_FIELD_CARD_NOTES,
  REPORT_FIELD_DESCRIPTIONS,
  REPORT_SECTIONS_CARD_NOTE,
  REPORT_SECTIONS_DESCRIPTION,
} from "./report-tool.ts"

/** `report_part_card` ツールの説明文。 */
export const PART_CARD_TOOL_DESCRIPTION =
  "report の components に置く部品の JSON Schema と、components の例1つを、部品の名前を渡して引く。" +
  "JSON Schema は report の定義の部品と同じ形で、欄ごとの書き方の説明はこのカードにだけ載る。部品を初めて使う前に引く"

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
      `部品 ${component} の文法（report の定義の部品と同じ形の JSON Schema に、欄の書き方の説明を足したもの）`,
      "JSON Schema:",
      JSON.stringify(omit(cardJsonSchema(CARD_SCHEMAS[component]), ["$schema"])),
      "例（components の要素。id は例の中で閉じている）:",
      JSON.stringify(PART_EXAMPLES[component]),
      ...expressionExampleLines(component),
    ].join("\n"),
  }
}

/** カードの JSON Schema。`report` の定義と同じ形に、カードにだけ載せる欄の説明（`PART_CARD_NOTES`）を定義の説明のあとへ足す。 */
function cardJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    io: "input",
    override: ({ zodSchema, jsonSchema }) => {
      const note = PART_CARD_NOTES.get(zodSchema)
      if (note !== undefined) {
        const own = jsonSchema.description
        jsonSchema.description =
          own === undefined
            ? note.description
            : `${own}${own.endsWith("。") ? "" : "。"}${note.description}`
      }
    },
  })
}

/**
 * `Report` と `Section` のカードの形。`report` の定義で付ける欄の説明に、カードにだけ載せる細かい書き方を足す。
 * 図の説明は利用者の既定で変わるので、カードには位置と最小形だけを載せる。
 */
function reportCardSchemas() {
  const { Report, Section } = REPORT_COMPONENT_SCHEMAS
  const { shape } = Report
  return {
    Report: Report.extend({
      figure: partCardNote(shape.figure, REPORT_FIELD_CARD_NOTES.figure),
      workPlanClosing: partCardNote(shape.workPlanClosing, REPORT_FIELD_CARD_NOTES.workPlanClosing),
      keyFigures: partCardNote(shape.keyFigures, REPORT_FIELD_CARD_NOTES.keyFigures),
      task: noted(shape.task, "task"),
      retrospective: noted(shape.retrospective, "retrospective"),
      favor: noted(shape.favor, "favor"),
      checks: noted(shape.checks, "checks"),
      title: noted(shape.title, "title"),
      sessionSummary: noted(shape.sessionSummary, "sessionSummary"),
      sessionRemaining: noted(shape.sessionRemaining, "sessionRemaining"),
      closing: noted(shape.closing, "closing"),
      waitingLine: noted(shape.waitingLine, "waitingLine"),
    }),
    Section: partCardNote(Section.describe(REPORT_SECTIONS_DESCRIPTION), REPORT_SECTIONS_CARD_NOTE),
  }
}

/** `Report` の欄に、定義と同じ説明とカードにだけ載せる細かい書き方を付ける。 */
function noted<Schema extends z.ZodType>(
  schema: Schema,
  field: keyof typeof REPORT_FIELD_DESCRIPTIONS,
): Schema {
  return partCardNote(
    schema.describe(REPORT_FIELD_DESCRIPTIONS[field]),
    REPORT_FIELD_CARD_NOTES[field],
  )
}

const CARD_SCHEMAS = { ...REPORT_COMPONENT_SCHEMAS, ...reportCardSchemas() }

/** 触れるレポート（つまみと式）の書き方。式を結べる部品とつまみの部品のカードにだけ載せる。 */
const EXPRESSION_GUIDE =
  "触れるレポート: 読み手が前提の値を振って結果の変わり方を比べたい問い（どの値がよいか・しきい値で何が変わるか・条件を足すとどうなるか）のときだけ、" +
  "ParameterSlider（name・label・min・max・step・initial）か ParameterCheckBox（name・label・initial）を置く。つまみは4個まで。結論の文は初期値のまま読めるように書く。\n" +
  '値はリテラル、{call:"expr",args:{source:式}}、{call:"format",args:{template:"…${式}…"}} のどれか。式を結べるのは Paragraph.text・Stats の value/before/target・Chart の title/labels/values/emphasis だけ。\n' +
  '式: つまみの name と Report.defs（名前→式の文字列）の名前、数・"文字"・true/false・[1,2]、+ - * / %、比較、&& || !、条件 ? A : B（並びとの演算は要素ごと）。' +
  "関数: range(a,b) min max round(x,d) fixed(x,d) sum len minOf maxOf argmin argmax at(list,i) text(list,suffix)。\n" +
  "数を文字にすると整数はそのまま、それ以外は小数1桁。桁を変えるなら fixed(x, 桁)。" +
  "文を条件で切り替えるときは defs の式に文字を返させ、${…} の中は名前か短い式だけにする。" +
  "差の向きは引き算で書かず、Stats の before と value を結んで better で言う。"

const EXPRESSION_EXAMPLE_HEADING =
  "式を結ぶ例（つまみの name と defs の名前を式で読む。format の ${…} には名前か短い式だけを書き、文字のリテラルは書かない）:"

function expressionExampleLines(component: string): readonly string[] {
  const example = EXPRESSION_EXAMPLES.get(component)
  return example === undefined
    ? []
    : [EXPRESSION_GUIDE, EXPRESSION_EXAMPLE_HEADING, JSON.stringify(example)]
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
        items: [
          {
            label: "所要（秒）",
            before: "240",
            value: expr("cur"),
            better: "down",
            change: "−156（−65%）",
          },
        ],
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
  [
    "ChartGrid",
    [
      reportRoot({ ...WORKER_DEFS, lint: "ws * 0 + 30", test: "times / 2" }),
      { id: "s1", component: "Section", heading: "段ごとの所要", children: ["w1", "cg1"] },
      WORKER_SLIDER,
      {
        id: "cg1",
        component: "ChartGrid",
        chartKind: "line",
        title: format("w = ${w} のときの段ごとの所要（秒）"),
        labels: expr('text(ws, "本")'),
        panels: [
          { heading: "lint", series: [{ name: "所要（秒）", values: expr("lint") }] },
          { heading: "test", series: [{ name: "所要（秒）", values: expr("test") }] },
        ],
      },
    ],
  ],
])

const COMPONENT_NAMES = Object.keys(REPORT_COMPONENT_SCHEMAS)

function isComponentName(name: string): name is keyof typeof REPORT_COMPONENT_SCHEMAS {
  return Object.hasOwn(REPORT_COMPONENT_SCHEMAS, name)
}
